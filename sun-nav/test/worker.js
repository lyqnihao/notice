/**
 * Sun Nav 【测试版】Worker —— 站点元数据抓取 /api/meta
 * ----------------------------------------------------------------
 * 版本: v1.4.0-test.1   仅用于「自动获取站点信息」功能验证，与正式版完全隔离。
 *
 * 能力：
 *  1) GET /api/meta?url=<网址> -> 服务端抓取目标页 HTML，解析
 *     <title> / meta description / og:title / og:description /
 *     og:image / link[rel=icon]，返回 JSON。
 *  2) 其余请求交给 [assets] 静态资源；/api/data 明确返回 404，
 *     让前端降级到浏览器 localStorage（测试版不接 KV）。
 *
 * 安全（SSRF 防护）：
 *  - 仅 http/https，拒绝账号密码、非 80/443 端口
 *  - 拒绝 localhost / 私网段 / 链路本地 / 云元数据地址 / IPv6 字面量
 *  - 手动跟随重定向，每一跳重新校验，最多 3 跳
 *  - 6 秒超时、响应体上限 300KB、仅接受 HTML 类型
 *
 * 说明：DNS rebinding（域名解析到内网 IP）在 Workers 运行时无法彻底校验，
 *       已在 v1.4.0 转正时为 /api/meta 补上与 /api/data 一致的 SITE_PASSWORD 校验；
 *       若需更强隔离，可再加域名白名单或 Cloudflare Zero Trust / 出站策略。
 */

var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
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
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    var url = new URL(request.url);

    if (url.pathname === '/api/meta') {
      var target = url.searchParams.get('url') || '';
      if (!target) return json({ ok: false, error: '缺少 url 参数' }, 400);
      // 仅在「裸域名」时补 https；已有其它协议（file: / ftp: 等）保持原样交给 safeUrl 拒绝，
      // 避免把 file:///etc/passwd 拼成 https://file:///... 后产生含糊的 502。
      if (target.indexOf('://') < 0) target = 'https://' + target.replace(/^\/+/, '');
      if (!safeUrl(target)) return json({ ok: false, error: '不允许的地址（仅公网 http/https，禁用内网与元数据地址）' }, 400);
      try {
        var r = await fetchHtml(target);
        var meta = extractMeta(r.html, r.finalUrl);
        return json({
          ok: true, source: 'worker', finalUrl: r.finalUrl,
          title: meta.title.slice(0, 300),
          description: meta.description.slice(0, 500),
          logo: meta.logo, siteName: meta.siteName
        });
      } catch (e) {
        return json({ ok: false, error: String(e && e.message || e) }, 502);
      }
    }

    if (url.pathname === '/api/data') {
      return new Response('Not Found (test build: no KV)', { status: 404, headers: CORS });
    }

    if (env && env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not Found', { status: 404 });
  }
};
