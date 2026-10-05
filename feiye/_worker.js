// 绯夜 · CRIMSON NIGHT —— Cloudflare Pages 高级模式 Worker
// 作用：把 /api /api2 /api3 三个路径同源反代到采集源（浏览器直连会被跨域拦，必须由边缘代转）
// 其余所有请求原样交给静态资源。

const UPSTREAM = {
  '/api': 'https://apiyutu.com/api.php/provide/vod/',
  '/api2': 'https://lbapi9.com/api.php/provide/vod/',
  '/api3': 'https://slapibf.com/api.php/provide/vod/',
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Cache-Control': 'public, max-age=60',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const base = UPSTREAM[path];

    // 不是接口请求 -> 交给静态资源（html/css/js/图片）
    if (!base) return env.ASSETS.fetch(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    const init = {
      method: request.method === 'POST' ? 'POST' : 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': UA,
      },
    };
    if (init.method === 'POST') {
      init.headers['Content-Type'] =
        request.headers.get('content-type') || 'application/x-www-form-urlencoded';
      init.body = await request.arrayBuffer();
    }

    let resp;
    try {
      resp = await fetch(base + url.search, init);
    } catch (e) {
      return new Response(
        JSON.stringify({ code: 0, msg: 'upstream unreachable', list: [], class: [] }),
        { status: 502, headers: JSON_HEADERS }
      );
    }

    const body = await resp.arrayBuffer();
    return new Response(body, {
      status: resp.status,
      headers: {
        ...JSON_HEADERS,
        'Content-Type': resp.headers.get('content-type') || JSON_HEADERS['Content-Type'],
      },
    });
  },
};
