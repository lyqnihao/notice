/**
 * Sun Nav 同步 Worker（Cloudflare）
 * ----------------------------------------------------------------
 * 能力：
 *  1) GET /api/data  -> 读取 KV 中保存的书签数据（JSON 数组）
 *  2) PUT /api/data  -> 写入书签数据到 KV（多端实时同步）
 *  3) 密码锁：设置 SITE_PASSWORD 后，所有 /api/data 请求需带正确密码
 *  4) 定时备份：每天「北京时间 09:00」(UTC 01:00) 把 KV 当前数据以
 *     时间戳文件名备份到 WebDAV（默认坚果云），只新增、不删除旧备份
 *
 * 部署变量（大小写均可，Worker 内部不区分大小写）：
 *  - KV 绑定名：KV（必填）
 *  - SITE_PASSWORD  （可选，设置后启用密码锁，建议用 secret）
 *  - WEBDAV_URL     （如 https://dav.jianguoyun.com/dav/）
 *  - WEBDAV_USER    （坚果云账号 / 授权码用户名）
 *  - WEBDAV_PASS    （坚果云授权码，建议用 secret）
 *  - WEBDAV_PATH    （备份目录，默认 /sun-nav）
 */

/* 大小写不敏感读取环境变量 / 绑定 */
function getEnv(key, env) {
  if (!env) return undefined;
  var k = String(key).toLowerCase();
  for (var name in env) {
    if (Object.prototype.hasOwnProperty.call(env, name) && name.toLowerCase() === k) return env[name];
  }
  return undefined;
}

/* 北京时间戳 YYYYMMDDHHMMSS（基于 UTC+8） */
function bjTimeStamp() {
  var d = new Date(Date.now() + 8 * 3600 * 1000);
  var p = function (n) { return String(n).padStart(2, '0'); };
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
         p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds());
}

/* Basic Auth 头（兼容非 ASCII 用户名） */
function basicAuth(user, pass) {
  return 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass)));
}

/* 定时把 KV 数据备份到 WebDAV（坚果云） */
async function webdavBackup(env) {
  var kv = getEnv('KV', env) || getEnv('SUN_NAV_KV', env);
  if (!kv) return;
  var data = await kv.get('data') || '[]';

  var base = (getEnv('WEBDAV_URL', env) || '').replace(/\/+$/, '');
  var user = getEnv('WEBDAV_USER', env) || '';
  var pass = getEnv('WEBDAV_PASS', env) || '';
  var path = (getEnv('WEBDAV_PATH', env) || '/sun-nav').replace(/^\/+|\/+$/g, '');
  if (!base) return; // 未配置 WebDAV 则跳过备份

  var auth = basicAuth(user, pass);
  var dir = base + '/' + path;
  // 确保目录存在（已存在会报错，忽略即可）
  try {
    await fetch(dir, { method: 'MKCOL', headers: { 'Authorization': auth } });
  } catch (e) {}
  // 以时间戳文件名 PUT，只新增、不删除旧备份
  var file = dir + '/sun-nav-' + bjTimeStamp() + '.json';
  await fetch(file, {
    method: 'PUT',
    headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
    body: data
  });
}

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);

    // 预检（浏览器跨域）
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'content-type,x-site-pw'
        }
      });
    }

    if (url.pathname === '/api/data') {
      var kv = getEnv('KV', env) || getEnv('SUN_NAV_KV', env);
      if (!kv) return new Response('KV not bound', { status: 500 });

      var pw = url.searchParams.get('pw') || request.headers.get('x-site-pw') || '';
      var required = getEnv('SITE_PASSWORD', env);
      if (required && pw !== required) {
        return new Response('Unauthorized', {
          status: 401,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }

      var cors = { 'Access-Control-Allow-Origin': '*' };

      if (request.method === 'GET') {
        var data = await kv.get('data');
        return new Response(data || '[]', {
          headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
        });
      }
      if (request.method === 'PUT' || request.method === 'POST') {
        var body = await request.text();
        await kv.put('data', body);
        return new Response('OK', { headers: cors });
      }
      return new Response('Method Not Allowed', { status: 405, headers: cors });
    }

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(webdavBackup(env));
  }
};
