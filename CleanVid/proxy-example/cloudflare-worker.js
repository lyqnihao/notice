/**
 * Cloudflare Worker 简易 CORS 反代示例
 * 部署后把返回的 worker 地址填到 config.js 的 CORS_PROXY，末尾加 ?url=
 * 例如：CORS_PROXY: 'https://your-name.workers.dev/?url='
 *
 * 注意：仅供个人学习，请勿滥用；部分资源站可能封禁代理 IP。
 */
addEventListener('fetch', event => {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  const url = new URL(request.url);
  const target = url.searchParams.get('url');
  if (!target) {
    return new Response('缺少 url 参数', { status: 400 });
  }
  try {
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CleanVid/1.0)',
        Accept: 'application/json, text/plain, */*'
      }
    });
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=60'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
