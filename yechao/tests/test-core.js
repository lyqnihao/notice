/* signal-core.js 纯逻辑单元测试（Node 运行：node tests/test-core.js） */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const NC = require('../signal-core.js');

let pass = 0, fail = 0;
const asyncTests = [];
function T(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + ' → ' + e.message); fail++; }
}
function TA(name, fn) {
  // 收集异步测试，最后统一 await，避免 process.exit 提前退出导致漏测
  asyncTests.push((async () => {
    try { await fn(); console.log('  ✓ ' + name); pass++; }
    catch (e) { console.log('  ✗ ' + name + ' → ' + e.message); fail++; }
  })());
}
const dir = path.join(__dirname, 'fixtures'); // 自包含测试样本（真实订阅返回数据）

console.log('\n[A] 时间格式化');
T('fmtClock 小于1分钟', () => assert.strictEqual(NC.fmtClock(5), '00:05'));
T('fmtClock 分秒', () => assert.strictEqual(NC.fmtClock(83), '01:23'));
T('fmtClock 时分秒', () => assert.strictEqual(NC.fmtClock(5025), '01:23:45'));
T('fmtClock 非法值归零', () => assert.strictEqual(NC.fmtClock(NaN), '00:00'));

console.log('\n[B] Base58 编解码');
T('Base58 往返（中文 JSON）', () => {
  const s = JSON.stringify([{ name: '爱奇艺', api: 'https://x.com/api.php/provide/vod' }]);
  const enc = NC.base58Encode(s);
  assert.strictEqual(NC.utf8Decode ? NC.base58Decode(enc) instanceof Uint8Array : true, true);
  const dec = new TextDecoder().decode(NC.base58Decode(enc));
  assert.strictEqual(dec, s);
});
T('decodeSubscriptionText 识别 Base58', () => {
  const s = JSON.stringify({ api_site: { a: { name: 'A', api: 'https://x.com/api.php/provide/vod' } } });
  const r = NC.decodeSubscriptionText(NC.base58Encode(s));
  assert.strictEqual(r.via, 'base58');
  assert.ok(r.data.api_site);
});
T('decodeSubscriptionText 拒绝普通文本', () => {
  assert.throws(() => NC.decodeSubscriptionText('这不是订阅内容!!!'));
});

console.log('\n[C] M3U8 广告过滤');
const MASTER = '#EXTM3U\n#EXT-X-VERSION:3\n' +
  '#EXTINF:10.0,\nhttps://cdn.example.com/vod/main/seg0.ts\n' +
  '#EXTINF:10.0,\nhttps://cdn.example.com/vod/main/seg1.ts\n' +
  '#EXTINF:10.0,\nhttps://cdn.example.com/vod/main/seg2.ts\n' +
  '#EXTINF:10.0,\nhttps://cdn.example.com/vod/main/seg3.ts\n' +
  '#EXTINF:10.0,\nhttps://ad.other.com/promo/ad0.ts\n' +
  '#EXTINF:10.0,\nhttps://ad.other.com/promo/ad1.ts\n' +
  '#EXT-X-ENDLIST';
T('明显目录分布 → 过滤异目录广告段', () => {
  const r = NC.stripForeignSegments(MASTER, 'https://cdn.example.com/vod/main/index.m3u8');
  assert.strictEqual(r.changed, true);
  assert.strictEqual(r.removed, 2);
  assert.ok(!r.text.includes('ad.other.com'));
  assert.ok(r.text.includes('main/seg3.ts'));
});
T('分布不明显 → 原样返回不误删', () => {
  const mixed = '#EXTM3U\n' +
    '#EXTINF:10,\nhttps://a.com/x/1.ts\n#EXTINF:10,\nhttps://b.com/y/2.ts\n' +
    '#EXTINF:10,\nhttps://c.com/z/3.ts\n#EXTINF:10,\nhttps://d.com/w/4.ts';
  const r = NC.stripForeignSegments(mixed, 'https://a.com/x/i.m3u8');
  assert.strictEqual(r.changed, false);
  assert.strictEqual(r.reason, 'distribution_unclear');
});
T('样本过少 → 不处理', () => {
  const few = '#EXTM3U\n#EXTINF:10,\nhttps://a.com/x/1.ts\n#EXTINF:10,\nhttps://ad.com/y/2.ts';
  const r = NC.stripForeignSegments(few, 'https://a.com/x/i.m3u8');
  assert.strictEqual(r.changed, false);
  assert.strictEqual(r.reason, 'too_few_segments');
});
T('EXT-X-DISCONTINUITY 标签保留且广告 EXTINF 删除', () => {
  const m3u8 = '#EXTM3U\n' +
    '#EXTINF:10,\nhttps://a.com/x/1.ts\n#EXTINF:10,\nhttps://a.com/x/2.ts\n' +
    '#EXTINF:10,\nhttps://a.com/x/3.ts\n#EXTINF:10,\nhttps://a.com/x/4.ts\n' +
    '#EXT-X-DISCONTINUITY\n#EXTINF:10,\nhttps://ad.com/y/ad.ts\n#EXT-X-ENDLIST';
  const r = NC.stripForeignSegments(m3u8, 'https://a.com/x/i.m3u8');
  assert.strictEqual(r.removed, 1);
  assert.ok(!r.text.includes('ad.com'));
  assert.ok(r.text.includes('#EXT-X-DISCONTINUITY'));
});
T('带查询参数的 URL 正确按目录统计', () => {
  const m3u8 = '#EXTM3U\n' +
    [0, 1, 2, 3].map(i => `#EXTINF:10,\nhttps://a.com/vod/main/seg${i}.ts?token=abc&x=1`).join('\n') + '\n' +
    '#EXTINF:10,\nhttps://a.com/vod/ad/x.ts?token=abc\n';
  const r = NC.stripForeignSegments(m3u8, 'https://a.com/vod/main/i.m3u8');
  assert.strictEqual(r.removed, 1);
});
T('相对路径转绝对 / KEY URI 绝对化', () => {
  const abs = NC.absolutizeSegments('#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\nseg0.ts',
    'https://a.com/vod/main/i.m3u8');
  assert.ok(abs.includes('https://a.com/vod/main/key.bin'));
  assert.ok(abs.includes('https://a.com/vod/main/seg0.ts'));
});
T('master 列表子 m3u8 不算片段，不误过滤', () => {
  const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nlow/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2000\nhigh/index.m3u8';
  const r = NC.stripForeignSegments(master, 'https://a.com/master.m3u8');
  assert.strictEqual(r.changed, false);
  assert.strictEqual(NC.firstVariantUrl(master, 'https://a.com/master.m3u8'), 'https://a.com/low/index.m3u8');
});

console.log('\n[D] 订阅解析（真实数据 + 构造数据）');
function loadSample(f) { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
T('api_site 对象（format=0 真实地址）→ 69 条', () => {
  const r = NC.parseSubscription(loadSample('f0.json'));
  assert.strictEqual(r.format, 'api_site');
  assert.ok(r.sources.length >= 60, '实际 ' + r.sources.length);
  assert.ok(r.sources[0].api.includes('api.php/provide/vod'));
});
T('api_site 对象（hafrey1 真实地址）→ 69 条', () => {
  const r = NC.parseSubscription(loadSample('luna.json'));
  assert.ok(r.sources.length >= 60);
});
T('format=1 中继包裹 api 保留原始地址', () => {
  const r = NC.parseSubscription(loadSample('f1.json'));
  assert.ok(r.sources.length >= 60);
  assert.ok(r.sources[0].api.includes('lunatvcon.lyqnihao.dpdns.org'));
});
T('OmniBox sites（真实地址）→ 49 条且保留扩展字段', () => {
  const r = NC.parseSubscription(loadSample('omni.json'));
  assert.strictEqual(r.format, 'sites');
  assert.strictEqual(r.sources.length, 49);
  assert.ok(r.sources[0].tags.includes('优秀'));
  assert.strictEqual(r.sources[0].priority, 0);
});
T('JSON 数组', () => {
  const r = NC.parseSubscription([{ name: 'A', api: 'https://a.com/api.php/provide/vod' }]);
  assert.strictEqual(r.format, 'array');
  assert.strictEqual(r.sources.length, 1);
});
T('sources / list / data 容器', () => {
  for (const k of ['sources', 'list', 'data']) {
    const r = NC.parseSubscription({ [k]: [{ name: 'A', api: 'https://a.com/api.php/provide/vod' }] });
    assert.strictEqual(r.sources.length, 1, k);
  }
});
T('字段兼容 name/title/key/siteName 与 enabled/isActive', () => {
  const r = NC.parseSubscription({
    list: [
      { title: 'T', url: 'https://a.com/api.php/provide/vod', isActive: 0 },
      { siteName: 'S', apiUrl: 'https://b.com/api.php/provide/vod', active: true },
      { key: 'K', baseUrl: 'https://c.com/api.php/provide/vod', enabled: false },
    ]
  });
  assert.strictEqual(r.sources.length, 3);
  assert.strictEqual(r.sources[0].enabled, false);
  assert.strictEqual(r.sources[1].enabled, true);
  assert.strictEqual(r.sources[2].enabled, false);
  assert.strictEqual(r.sources[0].name, 'T');
});
T('去重：相同 API 不重复', () => {
  const r = NC.parseSubscription([
    { name: 'A', api: 'https://a.com/api.php/provide/vod' },
    { name: 'B', api: 'https://a.com/api.php/provide/vod/' },
  ]);
  assert.strictEqual(r.sources.length, 1);
});
T('TVBox 格式明确拒绝', () => {
  const r = NC.parseSubscription({ urls: [{ url: 'http://x' }], parses: [{ type: 1, url: 'http://y' }] });
  assert.strictEqual(r.format, 'unsupported');
  assert.ok(r.errors[0].includes('TVBox'));
});
T('非 CMS 接口（mp4 直链）被跳过', () => {
  const r = NC.parseSubscription([{ name: 'X', api: 'https://a.com/video/movie.mp4' }]);
  assert.strictEqual(r.sources.length, 0);
});
T('无效 JSON 抛出', () => {
  assert.throws(() => NC.decodeSubscriptionText('<<<not json>>>'));
});
T('HTML 响应被识别', () => {
  assert.strictEqual(NC.isHtml('<!DOCTYPE html><html><body>login</body></html>'), true);
  assert.strictEqual(NC.isHtml('{"api_site":{}}'), false);
});

console.log('\n[E] 订阅增量更新');
T('新增 + 更新 + 删除旧源，不动手动资源', () => {
  const current = [
    { id: 'm1', api: 'https://m.com/api.php/provide/vod', origin: 'manual', name: '手动' },
    { id: 's_old', api: 'https://old.com/api.php/provide/vod', origin: 'subscription', subscriptionId: 'sub1', name: '旧' },
    { id: 's_keep', api: 'https://keep.com/api.php/provide/vod', origin: 'subscription', subscriptionId: 'sub1', name: '留' },
  ];
  const incoming = [
    { id: 's_keep', api: 'https://keep.com/api.php/provide/vod', name: '留(更新)', origin: 'subscription', tags: [], enabled: true },
    { id: 's_new', api: 'https://new.com/api.php/provide/vod', name: '新', origin: 'subscription', tags: [], enabled: true },
  ];
  const r = NC.mergeSubscription(current, incoming, { id: 'sub1' });
  assert.strictEqual(r.stats.added, 1);
  assert.strictEqual(r.stats.updated, 1);
  assert.strictEqual(r.stats.removed, 1);
  assert.ok(r.sources.some(s => s.id === 'm1')); // 手动资源保留
  assert.ok(!r.sources.some(s => s.id === 's_old')); // 已移除旧源删除
  assert.ok(r.sources.some(s => s.id === 's_keep' && s.name === '留(更新)'));
});
T('空数组不清空', () => {
  const cur = [{ id: 'a', api: 'https://a.com/api.php/provide/vod' }];
  const r = NC.mergeSubscription(cur, [], { id: 'sub1' });
  assert.strictEqual(r.sources.length, 1);
  assert.ok(r.errors.length > 0);
});
T('订阅与手动 API 冲突不覆盖手动配置', () => {
  const cur = [{ id: 'm1', api: 'https://a.com/api.php/provide/vod', origin: 'manual', name: '我的配置' }];
  const incoming = [{ id: 'x', api: 'https://a.com/api.php/provide/vod', name: '订阅覆盖', origin: 'subscription' }];
  const r = NC.mergeSubscription(cur, incoming, { id: 'sub1' });
  const m = r.sources.find(s => s.id === 'm1');
  assert.strictEqual(m.name, '我的配置');
  assert.strictEqual(r.stats.skipped, 1);
});
T('不删除其他订阅来源的资源', () => {
  const cur = [
    { id: 'a1', api: 'https://a.com/api.php/provide/vod', origin: 'subscription', subscriptionId: 'sub2' },
    { id: 'b1', api: 'https://b.com/api.php/provide/vod', origin: 'subscription', subscriptionId: 'sub1' },
  ];
  const r = NC.mergeSubscription(cur, [], { id: 'sub1' });
  // 空数组直接保留全部
  assert.ok(r.sources.some(s => s.subscriptionId === 'sub2'));
});

console.log('\n[F] 请求模式与错误分类');
TA('direct 模式只用直连', async () => {
  const calls = [];
  const fake = async (u) => { calls.push(u); return { ok: true, text: async () => 'ok' }; };
  const r = await NC.fetchWithMode('https://a.com/api.php/provide/vod', { mode: 'direct', fetchImpl: fake });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(r.via, 'direct');
});
TA('fallback 直连失败自动用 relay', async () => {
  const calls = [];
  const fake = async (u) => {
    calls.push(u);
    if (u.startsWith('https://a.com')) throw new TypeError('Failed to fetch');
    return { ok: true, text: async () => 'ok' };
  };
  const r = await NC.fetchWithMode('https://a.com/api.php/provide/vod',
    { mode: 'fallback', relay: 'https://relay.example/?url=', fetchImpl: fake });
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(r.via, 'relay');
  assert.ok(calls[1].startsWith('https://relay.example/?url='));
});
TA('relay-first 优先中继', async () => {
  const calls = [];
  const fake = async (u) => { calls.push(u); return { ok: true }; };
  await NC.fetchWithMode('https://a.com/api.php/provide/vod',
    { mode: 'relay-first', relay: 'https://r/?url=', fetchImpl: fake });
  assert.ok(calls[0].startsWith('https://r/?url='));
});
TA('relay 不可用（无自定义地址）时 fallback 仍可直连成功', async () => {
  const fake = async (u) => { assert.ok(u.startsWith('https://a.com')); return { ok: true }; };
  const r = await NC.fetchWithMode('https://a.com/api.php/provide/vod', { mode: 'fallback', relay: '', fetchImpl: fake });
  assert.strictEqual(r.via, 'direct');
});
T('错误分类：AbortError→超时', () => {
  const e = new Error('x'); e.name = 'AbortError';
  assert.strictEqual(NC.classifyError(e).code, 'timeout');
});
T('错误分类：TypeError→跨域网络', () => {
  assert.strictEqual(NC.classifyError(new TypeError('Failed to fetch')).code, 'cors_network');
});
T('错误分类：HTTP 状态', () => {
  assert.strictEqual(NC.classifyError(new Error('HTTP 503')).code, 'http');
});
T('lunaRelay 拼接', () => {
  assert.strictEqual(NC.lunaRelay('https://a.com/x?y=1', 'https://r/?url='),
    'https://r/?url=' + encodeURIComponent('https://a.com/x?y=1'));
});

/* ===== v3.2.1 新增测试 ===== */
T('v3.2.1 内置默认中继已配置（参考 TIDEFLOW）', () => {
  assert.ok(NC.DEFAULT_RELAY && /^https?:\/\//.test(NC.DEFAULT_RELAY), '默认中继应为 http(s) 地址');
  assert.ok(NC.DEFAULT_RELAY.indexOf('url=') > -1, '默认中继应含 url= 参数');
});
T('v3.2.1 不传 relay 时 lunaRelay 使用内置默认（开箱即用）', () => {
  const out = NC.lunaRelay('https://a.com/api.php/provide/vod');
  assert.ok(out && out.indexOf(encodeURIComponent('https://a.com/api.php/provide/vod')) > -1, '应使用默认中继拼接');
});
T('v3.2.1 自定义 relay 覆盖内置默认', () => {
  const out = NC.lunaRelay('https://a.com/x', 'https://my.worker/?url=');
  assert.strictEqual(out, 'https://my.worker/?url=' + encodeURIComponent('https://a.com/x'));
});
T('v3.2.1 NSFW 中文敏感词识别', () => {
  assert.strictEqual(NC.isNsfwText('成人影片'), true);
  assert.strictEqual(NC.isNsfwText('色情内容'), true);
  assert.strictEqual(NC.isNsfwText('正常电影 动作片'), false);
});
T('v3.2.1 NSFW 拉丁词按边界识别（不过度误杀）', () => {
  assert.strictEqual(NC.isNsfwText('porn video'), true);
  assert.strictEqual(NC.isNsfwText('ordinary movie'), false); // internal 'ordinary' 不含独立 adult/sex 等
});
T('v3.2.1 isNsfwSource 显式标记与名称提示', () => {
  assert.strictEqual(NC.isNsfwSource({ name: '普通站', nsfw: true }), true);
  assert.strictEqual(NC.isNsfwSource({ name: '91麻豆资源' }), true);
  assert.strictEqual(NC.isNsfwSource({ name: '爱奇艺' }), false);
});
T('v3.2.1 订阅线路携带 nsfw 字段', () => {
  const r = NC.parseSubscription([{ name: '敏感站', api: 'https://a.com/api.php/provide/vod' }]);
  assert.strictEqual(typeof r.sources[0].nsfw, 'boolean');
});

(async () => {
  // 等待所有异步测试真正完成再汇总，确保结果真实
  await Promise.all(asyncTests);
  console.log('\n========================================');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  console.log('========================================\n');
  process.exit(fail ? 1 : 0);
})();
