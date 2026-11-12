/**
 * Sun Nav 同步 Worker（Cloudflare）
 * ----------------------------------------------------------------
 * 能力：
 *  1) GET /api/data  -> 读取 KV 中保存的书签数据（JSON 数组）
 *  2) PUT /api/data  -> 写入书签数据到 KV（多端实时同步）
 *  3) GET /api/meta  -> 抓取目标站点元数据（名称 / 描述 / Logo），供「自动获取」使用；
 *     内置 SSRF 防护（拒绝私网/元数据地址、逐跳校验重定向、超时与体积限制）
 *  4) 密码锁：设置 SITE_PASSWORD 后，/api/data 与 /api/meta 均需带正确密码
 *  5) 定时备份：每天「北京时间 09:00」(UTC 01:00) 把 KV 当前数据以
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

var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,x-site-pw',
  'Access-Control-Max-Age': '86400'
};

function isPrivateHost(host) {
  var h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h === 'metadata' || h === 'metadata.google.internal') return true;
  if (/(^|\.)(local|internal|localhost|localdomain)$/.test(h)) return true;
  if (h === '169.254.169.254') return true;
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return true;          // 十进制/十六进制 IP
  if (h.indexOf(':') >= 0) return true;                          // IPv6 字面量一律拒绝
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    var p = h.split('.').map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    if (p[0] === 192 && p[1] === 0 && p[2] === 0) return true;
  }
  return false;
}

function safeUrl(raw) {
  var u;
  try { u = new URL(raw); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  if (isPrivateHost(u.hostname)) return null;
  return u;
}

async function fetchHtml(target) {
  var cur = new URL(target);
  for (var hop = 0; hop < 4; hop++) {
    if (!safeUrl(cur.href)) throw new Error('unsafe target');
    var res = await fetch(cur.href, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7'
      },
      signal: AbortSignal.timeout(6000)
    });
    if ([301, 302, 303, 307, 308].indexOf(res.status) >= 0) {
      var loc = res.headers.get('location');
      if (!loc) throw new Error('redirect without location');
      cur = new URL(loc, cur.href);
      continue;
    }
    if (!res.ok) throw new Error('upstream ' + res.status);
    var ct = res.headers.get('content-type') || '';
    if (ct && ct.indexOf('html') < 0 && ct.indexOf('text/') < 0) throw new Error('not html');
    var text = await res.text();
    if (text.length > 300000) text = text.slice(0, 300000);
    return { html: text, finalUrl: cur.href };
  }
  throw new Error('too many redirects');
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); });
}

function attrOf(tag, name) {
  var m = tag.match(new RegExp(name + '\\s*=\\s*["\']([^"\']*)["\']', 'i'));
  if (!m) m = tag.match(new RegExp(name + '\\s*=\\s*([^\\s>]+)', 'i'));
  return m ? decodeEntities(m[1]).trim() : '';
}

function extractMeta(html, baseUrl) {
  var low = html.toLowerCase();
  var end = low.indexOf('</head>');
  var head = end > 0 ? html.slice(0, end) : html.slice(0, 100000);
  var out = { title: '', description: '', logo: '', siteName: '' };
  var desc = '', ogDesc = '', ogTitle = '', ogImage = '', iconHref = '', appleIcon = '';

  // 分别匹配：title 成对标签、meta/link 单个标签。
  // 不用混合 alternation，否则 <meta> 会把后面的 <title>...</title> 一起吞掉。
  var tm = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (tm) out.title = decodeEntities(tm[1]).replace(/\s+/g, ' ').trim();

  var metas = head.match(/<meta\b[^>]*>/gi) || [];
  metas.forEach(function (tag) {
    var key = (attrOf(tag, 'name') || attrOf(tag, 'property')).toLowerCase();
    var val = attrOf(tag, 'content');
    if (key === 'description' && !desc) desc = val;
    if (key === 'og:description' && !ogDesc) ogDesc = val;
    if (key === 'og:title' && !ogTitle) ogTitle = val;
    if (key === 'og:image' && !ogImage) ogImage = val;
    if (key === 'og:site_name') out.siteName = val;
  });

  var links = head.match(/<link\b[^>]*>/gi) || [];
  links.forEach(function (tag) {
    var rel = attrOf(tag, 'rel').toLowerCase();
    var href = attrOf(tag, 'href');
    if (/\bicon\b/.test(rel) && !iconHref) iconHref = href;
    if (rel === 'apple-touch-icon' && !appleIcon) appleIcon = href;
  });

  out.title = ogTitle || out.title;
  out.description = (desc || ogDesc).replace(/\s+/g, ' ').trim();
  var rawIcon = iconHref || appleIcon || ogImage;
  if (rawIcon && !/^data:/i.test(rawIcon)) {         // 忽略 data:, 之类的空占位图标，交给前端 favicon 探测兜底
    try { out.logo = new URL(rawIcon, baseUrl).href; } catch (e) {}
  }
  return out;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CORS)
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

    // 站点元数据抓取（自动获取站点信息 · v1.4.0）：与 /api/data 一致的密码校验，
    // 避免该接口被当作公开代理；服务端抓取带完整 SSRF 防护（见 isPrivateHost / fetchHtml）。
    if (url.pathname === '/api/meta') {
      var mpw = url.searchParams.get('pw') || request.headers.get('x-site-pw') || '';
      var mrequired = getEnv('SITE_PASSWORD', env);
      if (mrequired && mpw !== mrequired) return json({ ok: false, error: 'Unauthorized' }, 401);

      var target = url.searchParams.get('url') || '';
      if (!target) return json({ ok: false, error: '缺少 url 参数' }, 400);
      if (target.indexOf('://') < 0) target = 'https://' + target.replace(/^\/+/, '');
      if (!safeUrl(target)) return json({ ok: false, error: '不允许的地址（仅公网 http/https，禁用内网与元数据地址）' }, 400);
      try {
        var r = await fetchHtml(target);
        var meta = extractMeta(r.html, r.finalUrl);
        return json({ ok: true, source: 'worker', finalUrl: r.finalUrl,
          title: meta.title.slice(0, 300), description: meta.description.slice(0, 500),
          logo: meta.logo, siteName: meta.siteName });
      } catch (e) {
        return json({ ok: false, error: String(e && e.message || e) }, 502);
      }
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
