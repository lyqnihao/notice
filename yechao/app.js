/* ============================================================
   夜潮 NOCTIDE —— 前端逻辑
   ============================================================ */
const CFG = {
  // API 地址由 SourceManager 动态提供，浏览器直接请求苹果 CMS V10 采集接口。
  apis: [],
  pageSize: 24,          // 期望每页条数（源不支持时按源的实际条数走）
  hotCats: 20,           // 分类条最多展示几个
  bootPages: 3,          // 首屏并发预载页数
  poolMin: 120,          // 筛选时希望凑够的数据量
  randMaxPage: 900,      // 随机取片的最大页码（源共 1 万多页）
  topic: '',             // 通用站留空
  topicCats: [],
};

/* ── 工具 ───────────────────────────── */
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const esc = t => String(t ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rand = a => a[Math.floor(Math.random() * a.length)];
const uniq = a => [...new Set(a)];

const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem('nc_' + k)); return v ?? d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('nc_' + k, JSON.stringify(v)); } catch (_) {} },
};

/* ── 本地数据：收藏 / 历史 / 进度 ─────── */
let FAV = LS.get('fav', []);
let HIST = LS.get('hist', []);
let WATCH = LS.get('watch', {});          // { id: {t: 已看秒数, d: 总秒数} }

const saveFav = () => { LS.set('fav', FAV); paintFavN(); };
const saveHist = () => { LS.set('hist', HIST.slice(0, 120)); };
const saveWatch = () => { LS.set('watch', WATCH); };

const slim = v => ({
  id: v.id, name: v.name, pic: v.pic, cat: v.cat, rem: v.rem,
  year: v.year, hits: v.hits, score: v.score, time: v.time,
});
const isFav = id => FAV.some(x => String(x.id) === String(id));

function paintFavN() {
  const n = $('#favN');
  if (!n) return;
  n.hidden = !FAV.length;
  n.textContent = FAV.length > 99 ? '99+' : FAV.length;
}

function toggleFav(v) {
  const i = FAV.findIndex(x => String(x.id) === String(v.id));
  if (i > -1) { FAV.splice(i, 1); toast('已取消收藏'); }
  else { FAV.unshift(slim(v)); toast('已加入收藏'); }
  saveFav();
  return isFav(v.id);
}

function pushHist(v) {
  HIST = HIST.filter(x => String(x.id) !== String(v.id));
  HIST.unshift({ ...slim(v), at: Date.now() });
  saveHist();
}

/* ── 网络 ───────────────────────────── */
const withTimeout = (p, ms = 9000) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

function buildURL(base, params) {
  const u = new URL(base, location.origin);
  Object.entries(params).forEach(([k, v]) => v != null && v !== '' && u.searchParams.set(k, v));
  return u;
}

async function get(base, params) {
  // v3.2.2：与 TIDEFLOW 对齐，采集站接口统一走统一请求封装（默认 relay-first，
  // 浏览器对采集站直连几乎必然 CORS 失败，优先中继才能正常加载）。
  // 旧版本这里是裸 fetch，导致「检测正常但实际首页/播放取不到数据」。
  const u = buildURL(base, params).href;
  const cfg = (window.SourceManager && SourceManager.getCfg) ? SourceManager.getCfg() : {};
  if (window.NC && NC.fetchWithMode) {
    const out = await NC.fetchWithMode(u, {
      mode: cfg.mode || 'relay-first', relay: cfg.relay || '', timeout: cfg.timeout || 9000,
      fetchOptions: { headers: { Accept: 'application/json' }, cache: 'no-store' },
    });
    if (!out.response.ok) throw new Error('HTTP ' + out.response.status);
    return await out.response.json();
  }
  // 兜底：核心模块缺失时退回直连（不应发生）
  const r = await withTimeout(fetch(u, { headers: { Accept: 'application/json' } }), (cfg.timeout || 9000));
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.json();
}

// 带线路自动切换的请求（主源拿不到数据 → 顺次试备源）
async function api(params, allowFailover = true) {
  const apis = SourceManager.apis();
  if (!apis.length) throw new Error('没有启用的资源站，请先在资源站管理中添加或启用线路');
  if (S.line < 0 || S.line >= apis.length) S.line = Math.max(0, SourceManager.active());
  try {
    return await get(apis[S.line], params);
  } catch (e) {
    if (allowFailover) {
      for (let i = 0; i < apis.length; i++) {
        if (i === S.line || S.dead.has(i)) continue;
        try {
          const d = await get(apis[i], params);
          S.line = i; SourceManager.setActiveIndex(i);
          return d;
        } catch (_) { S.dead.add(i); }
      }
    }
    throw e;
  }
}

/* ── 状态 ───────────────────────────── */
const S = {
  view: 'home', cat: '', kw: '', page: 1, pages: 1, total: 0,
  pool: [], cats: [], loading: false, booted: false,
  line: 0, dead: new Set(),
  filter: { year: '', res: '', sort: '' },
  rail: [], rank: [],
};

/* ── 数据归一化 ─────────────────────── */
function norm(v) {
  const time = v.vod_time || '';
  return {
    id: v.vod_id, name: v.vod_name || '', pic: v.vod_pic || '',
    cat: v.type_name || '', rem: v.vod_remarks || '',
    hits: Number(v.vod_hits) || 0, score: Number(v.vod_score) || 0,
    time, year: time.slice(0, 4), url: v.vod_play_url || '',
    content: v.vod_content || v.vod_blurb || '',
    actor: v.vod_actor || '', director: v.vod_director || '',
    tags: v.vod_tag ? String(v.vod_tag).split(/[,，\/]/).filter(Boolean) : [],
    src: v._src || '',
    _raw: v,
  };
}

/* NSFW 内容级过滤：过滤开启时，标题/分类/标签/简介命中敏感词则隐藏 */
function nsfwHidden(n) {
  if (!(window.SourceManager && SourceManager.nsfwFilterOn && SourceManager.nsfwFilterOn())) return false;
  if (NC.isNsfwText && NC.isNsfwText([n.name, n.cat, (n.tags || []).join(' '), n.content].join(' '))) return true;
  return false;
}

function merge(list) {
  const seen = new Set(S.pool.map(x => String(x.id)));
  let add = 0;
  list.forEach(v => {
    const n = norm(v);
    if (!n.id || seen.has(String(n.id))) return;
    if (nsfwHidden(n)) return;
    seen.add(String(n.id)); S.pool.push(n); add++;
  });
  return add;
}

/* ── 骨架屏 ─────────────────────────── */
const skeleton = (n = 18) =>
  `<div class="sec-hd"><h2>正在拉取片库…</h2></div>
   <div class="grid">${'<div class="sk"></div>'.repeat(n)}</div>`;

/* ── 卡片 ───────────────────────────── */
function codeOf(name) {
  const m = (name || '').match(/^[A-Z]{2,5}[-\s]?\d{2,5}/i);
  return m ? m[0] : '';
}

function card(v, opt = {}) {
  const code = codeOf(v.name);
  const prog = WATCH[v.id];
  const pct = prog && prog.d ? Math.min(98, Math.round(prog.t / prog.d * 100)) : 0;
  return `<article class="card" data-id="${esc(v.id)}" tabindex="0">
    ${opt.rank ? `<span class="rk">${opt.rank}</span>` : ''}
    <div class="thumb">
      ${code ? `<span class="badge badge-tag">${esc(code)}</span>` : ''}
      ${v.src ? `<span class="badge badge-src" title="来源线路：${esc(v.src)}">${esc(v.src)}</span>` : ''}
      ${v.rem ? `<span class="badge badge-hd">${esc(v.rem)}</span>` : ''}
      ${isFav(v.id) ? `<span class="badge badge-fav" title="已收藏">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.5s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 8a4.4 4.4 0 0 1 7.5 2.9c0 5-7.5 9.6-7.5 9.6Z"/></svg>
      </span>` : ''}
      <img data-src="${esc(v.pic)}" alt="${esc(v.name)}" loading="lazy">
      <span class="play-hint"><span>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </span></span>
      ${pct ? `<span class="prog"><i style="width:${pct}%"></i></span>` : ''}
    </div>
    <div class="c-name">${esc(v.name)}</div>
    <div class="c-sub">
      ${v.cat ? `<span class="c-cat">${esc(v.cat)}</span>` : ''}
      ${v.year && v.year !== '0000' ? `<span>${esc(v.year)}</span>` : ''}
      ${v.score ? `<span class="c-score">★ ${Number(v.score).toFixed(1)}</span>` : ''}
      ${v.hits ? `<span>${v.hits > 9999 ? (v.hits / 10000).toFixed(1) + 'w' : v.hits} 次</span>` : ''}
    </div>
  </article>`;
}

/* ── 懒加载 ─────────────────────────── */
const io = new IntersectionObserver(es => {
  es.forEach(e => {
    if (!e.isIntersecting) return;
    const img = e.target;
    io.unobserve(img);
    const s = img.dataset.src;
    if (!s) return;
    img.src = s;
    img.onload = () => img.classList.add('in');
    img.onerror = () => {
      // 封面挂了不留灰块：换成占位底色
      img.style.display = 'none';
      img.parentElement?.classList.add('noimg');
    };
  });
}, { rootMargin: '320px' });

const bindLazy = root => $$('img[data-src]', root).forEach(i => io.observe(i));

/* ── 分类 ───────────────────────────── */
// 苹果CMS 只有 ac=list 会返回 class 分类表，videolist 不带，所以单独拉一次
async function loadCats() {
  try {
    if (CFG.topic && CFG.topicCats.length) {
      S.cats = CFG.topicCats.map(w => ({ type_id: 'kw:' + w, type_name: w }));
    } else {
      const d = await api({ ac: 'list' });
      S.cats = d.class?.length ? leafCats(d.class) : [];
    }
    renderCats();
  } catch (e) { /* 分类拉不到不影响列表 */ }
}

// 苹果CMS 的父分类本身挂 0 部片，片子全在子分类里，只展示叶子分类
function leafCats(all) {
  const parents = new Set(all.map(c => String(c.type_pid)));
  const leaves = all.filter(c => !parents.has(String(c.type_id)));
  return leaves.length ? leaves : all;
}

function renderCats() {
  const box = $('#catsIn');
  if (!box) return;
  const items = [{ type_id: '', type_name: '全部' }, ...S.cats.slice(0, CFG.hotCats)];
  box.innerHTML = items.map(c =>
    `<button class="cat${String(c.type_id) === String(S.cat) ? ' on' : ''}" data-id="${esc(c.type_id)}">${esc(c.type_name)}</button>`
  ).join('');
}

/* ── 列表加载 ───────────────────────── */
function listParams(pg) {
  return {
    ac: 'videolist', pg, pagesize: CFG.pageSize,
    t: (S.cat && !String(S.cat).startsWith('kw:')) ? S.cat : null,
    wd: [CFG.topic, S.kw].filter(Boolean).join(' ') || null,
  };
}

// 线路名简化：去常见后缀词 + 截前6字，用于卡片角标和播放页线路按钮
function shortSrc(s) {
  let x = String(s || '').trim();
  x = x.replace(/(影视资源站|影视资源|影视在线|资源在线|资源站|\bIMTV\b|\bTV\b|影视|资源|在线|官网|视频|影院|传媒|联盟|播放|专区|频道|导航|数据)/gi, '').trim();
  x = x.replace(/[·\-_\s]+$/, '').trim();
  x = x.replace(/[站网]$/, '').trim();
  if (!x) x = String(s || '').trim();
  return x.length > 6 ? x.slice(0, 6) : (x || '线路');
}
// 当前取数线路的资源站名（api() failover 后 S.line 已是实际成功的线路）
function currentSrcName() {
  const s = window.SourceManager?.sourceAt?.(S.line);
  return shortSrc(s?.name || '');
}

async function fetchPage(pg) {
  // videolist 返回完整字段（含 vod_pic 封面 + vod_play_url 播放地址），
  // ac=list 只有 8 个字段没有图，列表页会全是空白
  const d = await api(listParams(pg));
  if (d?.pagecount) S.pages = d.pagecount;
  if (d?.total != null) S.total = d.total;
  const src = currentSrcName();
  return (d?.list || []).filter(x => x.vod_id).map(x => ({ ...x, _src: src }));
}

// 并发预载多页（首屏提速）
async function bootPool() {
  const reqs = [];
  for (let i = 0; i < CFG.bootPages; i++) reqs.push(fetchPage(i + 1).catch(() => []));
  const rs = await Promise.all(reqs);
  let got = 0;
  rs.forEach(r => { if (r.length) got += merge(r); });
  S.page = CFG.bootPages;
  S.booted = got > 0;
}

// 筛选需要更大样本时补齐数据
async function fillPool() {
  while (S.pool.length < CFG.poolMin && S.page < S.pages && S.page < 12) {
    S.page++;
    try {
      const r = await fetchPage(S.page);
      if (!r.length) break;
      merge(r);
    } catch (_) { break; }
  }
}

async function load(reset = false) {
  const app = $('#app');
  if (reset) {
    S.page = 1; S.pool = []; S.total = 0; S.pages = 1;
    if (S.view === 'home') app.innerHTML = skeleton();
  }
  try {
    await bootPool();
    render();
  } catch (e) {
    app.innerHTML = state('load-fail', '内容加载失败', '线路可能不稳，点下面换个线路试试',
      '<button class="btn-go" data-act="switchline">换条线路</button>');
  }
}

/* ── 状态块 ─────────────────────────── */
function state(kind, title, sub, extra = '') {
  const ico = kind === 'empty'
    ? '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'
    : '<circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/>';
  return `<div class="state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">${ico}</svg>
    <p>${esc(title)}</p><small>${esc(sub)}</small>${extra}</div>`;
}

/* ── 筛选 ───────────────────────────── */
function filtered() {
  const f = S.filter;
  let r = S.pool;
  if (f.res) r = r.filter(x => x.rem.includes(f.res));
  if (f.year) r = r.filter(x => x.year === f.year);
  if (f.sort === 'hot') r = [...r].sort((a, b) => b.hits - a.hits);
  else if (f.sort === 'score') r = [...r].sort((a, b) => b.score - a.score);
  else if (f.sort === 'new') r = [...r].sort((a, b) => String(b.time).localeCompare(String(a.time)));
  return r;
}

const filterActive = () => !!(S.filter.res || S.filter.year || S.filter.sort || S.kw || S.cat);

function paintFilterBtn() {
  const btn = $('#filterBtn'), n = $('#fCount');
  if (!btn || !n) return;
  const c = [S.filter.res, S.filter.year, S.filter.sort].filter(Boolean).length;
  n.hidden = !c; n.textContent = c;
  btn.classList.toggle('on', c > 0);
}

function buildFilter() {
  const body = $('#fBody');
  const years = uniq(S.pool.map(x => x.year).filter(y => y && y !== '0000')).sort().reverse();
  const tagCount = {};
  S.pool.forEach(x => { if (x.rem) tagCount[x.rem] = (tagCount[x.rem] || 0) + 1; });
  const tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 14).map(x => x[0]);
  const cats = S.cats.slice(0, CFG.hotCats);

  const grp = (title, items, cur, key) => `
    <div class="f-grp"><h4>${title}</h4><div class="f-opts">
      <button class="f-opt${!cur ? ' on' : ''}" data-k="${key}" data-v="">全部</button>
      ${items.map(v => `<button class="f-opt${cur === v.v ? ' on' : ''}" data-k="${key}" data-v="${esc(v.v)}">${esc(v.t)}</button>`).join('')}
    </div></div>`;

  body.innerHTML =
    grp('类型', cats.map(c => ({ v: String(c.type_id), t: c.type_name })), String(S.cat), 'cat') +
    (years.length ? grp('年份', years.map(y => ({ v: y, t: y })), S.filter.year, 'year') : '') +
    (tags.length ? grp('清晰度 / 标签', tags.map(t => ({ v: t, t })), S.filter.res, 'res') : '') +
    grp('排序', [{ v: 'new', t: '最新上架' }, { v: 'hot', t: '最多人看' }, { v: 'score', t: '评分最高' }],
      S.filter.sort || 'new', 'sort');
}

/* ── 渲染 ───────────────────────────── */
function render() {
  if (S.view === 'fav') return renderFav();
  if (S.view === 'hist') return renderHist();
  return renderHome();
}

function renderHome() {
  const app = $('#app');
  if (!S.pool.length) {
    app.innerHTML = state('empty', S.kw ? `没找到「${S.kw}」` : '这个分类暂时没有内容',
      '换个关键词或分类再试试');
    return;
  }

  if (filterActive()) {
    const list = filtered();
    const title = S.kw ? `搜索：${S.kw}` : (S.cats.find(c => String(c.type_id) === String(S.cat))?.type_name || '筛选结果');
    if (!list.length) {
      app.innerHTML = `<div class="sec-hd"><h2>${esc(title)}</h2>
        <span class="meta">已扫描 ${S.pool.length} 部</span></div>` +
        state('empty', '这个条件下暂时没有片子', '换个条件试试，或点筛选里的「重置」');
      return;
    }
    app.innerHTML = `
      <div class="sec-hd"><h2>${esc(title)}</h2>
        <span class="meta">${list.length} 部匹配 · 已扫描 ${S.pool.length} 部</span></div>
      <div class="grid">${list.map(v => card(v)).join('')}</div>
      ${S.page < S.pages ? '<div class="more"><button data-act="more">再多加载一些</button></div>' : ''}`;
    bindLazy(app);
    return;
  }

  // 沉浸首页：今日推荐 + 人气榜 + 最新上架
  const newest = [...S.pool].sort((a, b) => String(b.time).localeCompare(String(a.time)));
  const rail = S.rail.length ? S.rail : S.pool.slice(0, 14);
  const rank = [...S.pool].sort((a, b) => b.hits - a.hits).slice(0, 12);
  const day = new Date();
  const dayTxt = `${day.getMonth() + 1} 月 ${day.getDate()} 日`;

  app.innerHTML = `
    <div class="sec-hd"><h2>今日推荐</h2>
      <span class="meta">${dayTxt} · 每天换一批</span></div>
    <div class="rail-wrap"><div class="rail">${rail.map(v => card(v)).join('')}</div></div>

    <div class="sec-hd"><h2>人气榜</h2>
      <span class="meta">按播放量排的，前 12</span>
      <span class="spacer"></span>
      <button class="lnk" data-act="rank-refresh">换一批</button></div>
    <div class="rank">${rank.map((v, i) => card(v, { rank: i + 1 })).join('')}</div>

    <div class="sec-hd"><h2>最新上架</h2>
      <span class="meta">共 ${S.total ? S.total.toLocaleString() : '—'} 部 · 持续更新</span></div>
    <div class="grid">${newest.map(v => card(v)).join('')}</div>
    ${S.page < S.pages ? '<div class="more"><button data-act="more">加载更多</button></div>' : ''}`;

  bindLazy(app);
}

function renderFav() {
  const app = $('#app');
  if (!FAV.length) {
    app.innerHTML = state('empty', '还没有收藏',
      '播放页右上角的爱心点一下，片子就进收藏夹了',
      '<button class="btn-go" data-view="home">去逛逛</button>');
    return;
  }
  app.innerHTML = `
    <div class="sec-hd"><h2>我的收藏</h2><span class="meta">${FAV.length} 部</span></div>
    <div class="grid">${FAV.map(v => card(v)).join('')}</div>`;
  bindLazy(app);
}

function renderHist() {
  const app = $('#app');
  if (!HIST.length) {
    app.innerHTML = state('empty', '还没有观看记录',
      '看过的片子会自动记在这里，接着看很方便',
      '<button class="btn-go" data-view="home">去逛逛</button>');
    return;
  }
  app.innerHTML = `
    <div class="sec-hd"><h2>观看历史</h2><span class="meta">${HIST.length} 部</span>
      <span class="spacer"></span>
      <button class="lnk" data-act="hist-clear">清空</button></div>
    <div class="grid">${HIST.map(v => card(v)).join('')}</div>`;
  bindLazy(app);
}

/* ── 播放 ───────────────────────────── */
const NCF = window.NC || {};
let hls = null;
let CUR = null;          // 当前播放的条目
let PLAY_LINES = [];     // 当前影片的播放线路：[{name, eps:[{name,url}]}]
let curLine = 0, curEp = 0;
let playTimer = null;
let saveTick = null;
let playlistText = '';   // 最近一次拉取到的 m3u8 文本（过滤前）
let filteredBlobUrl = '';// 过滤后 blob 地址
let lastFilterRemoved = 0;
let introSkipped = false; // 片头跳过：每集只跳一次
let userSeeked = false;   // 用户是否手动拖过进度（防止片头误触发）
let warmedEp = -1;        // 已预热的下一集下标

/* 播放设置（本地持久化） */
const PREF = Object.assign(
  { adfOn: true, autoNext: true, skipIntro: false, introSec: 0, skipOutro: false, outroSec: 0 },
  (() => { try { return JSON.parse(localStorage.getItem('nc_player_pref_v1')) || {}; } catch (_) { return {}; } })()
);
const savePref = () => { try { localStorage.setItem('nc_player_pref_v1', JSON.stringify(PREF)); } catch (_) {} };

/* 解析 vod_play_url：$$$ 分隔线路，每条线路内 # 分隔剧集，最后 $ 后为地址
   fromStr = vod_play_from（苹果CMS 的线路名，同样用 $$$ 分隔），缺失则回退「线路N」 */
function parsePlayLines(urlStr, fromStr) {
  const froms = String(fromStr || '').split('$$$');
  return String(urlStr || '').split('$$$').map((line, li) => {
    const eps = line.split('#').map(s => {
      const i = s.lastIndexOf('$');
      if (i < 0) return null;
      const u = s.slice(i + 1).trim();
      return u ? { name: s.slice(0, i).trim() || '播放', url: u } : null;
    }).filter(Boolean);
    const rawName = shortSrc(froms[li] || '') || ('线路 ' + (li + 1));
    return { name: rawName, fullName: String(froms[li] || '').trim() || ('线路 ' + (li + 1)), eps };
  }).filter(l => l.eps.length);
}

function fmt(s) { return (NCF.fmtClock || ((x) => String(Math.floor(x || 0))))(s); }

async function play(id) {
  const mask = $('#pmask');
  mask.hidden = false;
  document.body.style.overflow = 'hidden';
  $('#pTitle').textContent = '加载中…';
  $('#progRow').hidden = true;
  const sr0 = $('#skipRow'); if (sr0) sr0.hidden = true;
  ['#lines', '#eps', '#pDetail', '#pChips', '#relGrid'].forEach(s => { const el = $(s); if (el) el.innerHTML = ''; });
  $('#filterNote').textContent = '—';
  hideFallback();

  try {
    let raw = S.pool.find(x => String(x.id) === String(id));
    if (!raw) raw = FAV.find(x => String(x.id) === String(id)) || HIST.find(x => String(x.id) === String(id));
    let v = raw;
    if (!v?.url) {
      const d = await api({ ac: 'detail', ids: id });
      const hit = d?.list?.[0];
      if (!hit) throw new Error('no data');
      v = norm(hit);
    }
    CUR = v;
    $('#pTitle').textContent = v.name || '播放';
    $('#pFav').classList.toggle('faved', isFav(v.id));

    PLAY_LINES = parsePlayLines(v.url, v._raw?.vod_play_from);
    if (!PLAY_LINES.length) throw new Error('no source');
    curLine = 0; curEp = 0;
    renderLines();
    renderDetail(v);
    renderChips(v);
    renderRelated(v);
    pushHist(v);

    // 续播：选集定位到上次观看的集（若记录了 epIndex）
    const w = WATCH[v.id];
    if (w && typeof w.ep === 'number' && w.ep < PLAY_LINES[0].eps.length) {
      curEp = w.ep;
      $$('.ep').forEach((b, i) => b.classList.toggle('on', i === curEp));
    }
    srcOf(curLine, curEp);
  } catch (e) {
    CUR = null;
    $('#pTitle').textContent = '播放';
    showFallback('', '这一部暂时没有可用的播放地址', '换一部试试，其它片子不受影响');
  }
}

function renderLines() {
  const box = $('#lines');
  if (!box) return;
  box.innerHTML = PLAY_LINES.map((l, i) =>
    `<button class="line-btn${i === curLine ? ' on' : ''}" data-line="${i}" title="${esc(l.fullName || l.name)}">${esc(l.name)}${l.eps.length > 1 ? ' · ' + l.eps.length + '集' : ''}</button>`
  ).join('');
  $('#pLineHint').textContent = `${PLAY_LINES.length} 条线路`;
}

function renderEps() {
  const box = $('#eps');
  if (!box) return;
  const eps = PLAY_LINES[curLine]?.eps || [];
  $('#epHint').textContent = `${eps.length} 集`;
  box.innerHTML = eps.length > 1
    ? eps.map((e, i) => `<button class="ep${i === curEp ? ' on' : ''}" data-ep="${i}" title="${esc(e.name)}">${esc(e.name)}</button>`).join('')
    : `<span class="p-hint">${eps.length ? '单片，无需选集' : '暂无剧集'}</span>`;
}

/* 影片详细信息（方案B ④） */
function renderDetail(v) {
  const rows = [];
  if (v.cat) rows.push(`<div class="pd-row"><span class="pd-label">分类</span>${esc(v.cat)}</div>`);
  if (v.year && v.year !== '0000') rows.push(`<div class="pd-row"><span class="pd-label">年份</span>${esc(v.year)}</div>`);
  if (v.rem) rows.push(`<div class="pd-row"><span class="pd-label">备注</span>${esc(v.rem)}</div>`);
  if (v.score) rows.push(`<div class="pd-row"><span class="pd-label">评分</span>★ ${Number(v.score).toFixed(1)}</div>`);
  if (v.hits) rows.push(`<div class="pd-row"><span class="pd-label">播放</span>${v.hits.toLocaleString()} 次</div>`);
  const desc = String(v.content || '').replace(/<[^>]+>/g, '').trim();
  $('#pDetail').innerHTML = rows.join('') + (desc ? `<div class="pd-desc">${esc(desc)}</div>` : '') || '<div class="p-hint">暂无更多信息</div>';
}

/* 演员/导演/分类/标签：可点击站内搜索（方案B ⑤） */
function renderChips(v) {
  const box = $('#pChips');
  if (!box) return;
  const chips = [];
  const raw = v._raw || {};
  const actors = raw.vod_actor || v.actor || '';
  const director = raw.vod_director || v.director || '';
  const cats = [v.cat, ...(Array.isArray(v.tags) ? v.tags : [])].filter(Boolean);
  const split = s => String(s || '').split(/[,，、\/]/).map(x => x.trim()).filter(Boolean);
  split(director).forEach(n => chips.push({ k: '导演', v: n, role: true }));
  split(actors).forEach(n => chips.push({ k: '演员', v: n, role: true }));
  cats.forEach(n => chips.push({ k: '分类', v: n, role: false }));
  box.innerHTML = chips.map((c, i) =>
    `<span class="p-chip${c.role ? ' role' : ''}" data-chip="${esc(c.v)}" title="点击搜索「${esc(c.v)}」"><span class="chip-k">${c.k}</span>${esc(c.v)}</span>`
  ).join('');
}

/* 相关推荐：同分类优先，点击切换播放（方案B ⑥） */
function renderRelated(v) {
  const box = $('#relGrid');
  if (!box) return;
  let rel = S.pool.filter(x => String(x.id) !== String(v.id) && x.cat && v.cat && x.cat === v.cat);
  if (rel.length < 4) {
    const more = S.pool.filter(x => String(x.id) !== String(v.id) && !rel.includes(x));
    rel = rel.concat(more);
  }
  rel = rel.slice(0, 12);
  box.innerHTML = rel.map(x => card(x)).join('');
  bindLazy(box);
}

/* 播放失败兜底 */
function showFallback(url, why, tip) {
  const box = $('#pfall');
  $('#pfWhy').textContent = why || '这条线路暂时打不开';
  $('#pfTip').textContent = tip || '片源服务器的问题，换一集或换一部试试';
  const a = $('#pfLink');
  if (url) { a.href = url; a.hidden = false; } else { a.hidden = true; }
  $('#pfSwitch').hidden = PLAY_LINES.length <= 1;
  box.hidden = false;
  $('#video').removeAttribute('controls');
}
const hasOtherLine = () => PLAY_LINES.length > 1 || SourceManager.apis().some((_, i) => i !== S.line && !S.dead.has(i));

const hideFallback = () => {
  clearTimeout(playTimer);
  const f = $('#pfall'); if (f) f.hidden = true;
  const v = $('#video'); if (v) v.setAttribute('controls', '');
};

/* 切换播放线路（影片内多条源）——重新过滤 */
function switchPlayLine(i) {
  if (i === curLine || !PLAY_LINES[i]) return;
  curLine = i; curEp = 0;
  renderLines(); renderEps();
  srcOf(curLine, curEp);
}

/* 切换剧集 */
function switchEpisode(i) {
  const eps = PLAY_LINES[curLine]?.eps || [];
  if (i < 0 || i >= eps.length) return;
  curEp = i;
  $$('.ep').forEach((b, j) => b.classList.toggle('on', j === i));
  srcOf(curLine, curEp);
}

/* —— 进度条（参考 TIDEFLOW：fmtClock / bindVideoEvents / progRow） —— */
let progDragging = false;
function progEls() {
  return { row: $('#progRow'), bar: $('#progBar'), cur: $('#progCur'), dur: $('#progDur') };
}
function showProg() {
  const r = progEls().row; if (r) r.hidden = false;
  const s = $('#skipRow'); if (s) s.hidden = false; // 片头片尾行紧随进度条一起显示
}
function updProg() {
  const { bar, cur, dur } = progEls();
  const video = $('#video');
  if (!bar || !video) return;
  const d = video.duration, t = video.currentTime;
  if (!isFinite(d) || !(d > 0)) {
    // 未知时长 → LIVE，禁用 seek，显示已播时长
    bar.disabled = true; bar.value = 0;
    cur.textContent = fmt(t);
    dur.textContent = 'LIVE';
    showProg();
    return;
  }
  bar.disabled = false;
  if (!progDragging) bar.value = Math.round(t / d * 1000);
  cur.textContent = fmt(t);
  dur.textContent = fmt(d);
  showProg();
}

function bindProgBar() {
  const { bar, cur } = progEls();
  if (!bar || bar._bound) return;
  bar._bound = true;
  bar.addEventListener('input', () => {
    progDragging = true;
    const v = $('#video');
    if (v && isFinite(v.duration) && v.duration > 0) cur.textContent = fmt((bar.value / 1000) * v.duration);
  });
  bar.addEventListener('change', () => {
    progDragging = false;
    const v = $('#video');
    if (v && isFinite(v.duration) && v.duration > 0) {
      userSeeked = true;                       // 手动跳转后，片头跳过不再触发
      v.currentTime = (bar.value / 1000) * v.duration;
    }
  });
}

/* 绑定 video 事件：更新进度、续播、自动下一集、片头片尾、预热、保存 */
function bindVideoEvents() {
  const video = $('#video');
  bindProgBar();
  video.addEventListener('loadedmetadata', () => {
    updProg();
    // 断点续播（单集内位置）
    const w = CUR && WATCH[CUR.id];
    if (w && w.t > 10 && isFinite(video.duration) && video.duration > w.t + 10 && !introSkipped) {
      try { video.currentTime = w.t; } catch (_) {}
    }
  });
  video.addEventListener('durationchange', updProg);
  video.addEventListener('canplay', updProg);
  video.addEventListener('playing', () => { clearTimeout(playTimer); showProg(); });
  video.addEventListener('error', () => {
    if ($('#pfall').hidden) showFallback(video.src || lastRawUrl, '这条线路暂时打不开');
  });
  video.addEventListener('timeupdate', () => {
    const d = video.duration, t = video.currentTime;
    if (!progDragging) updProg();
    if (!isFinite(d) || d <= 0) return;

    // 片头跳过：仅开头一次，用户未手动拖动，且开关开启
    if (PREF.skipIntro && !introSkipped && !userSeeked && PREF.introSec > 0 && t < PREF.introSec && t >= 0) {
      try { video.currentTime = Math.min(PREF.introSec, d - 1); } catch (_) {}
      introSkipped = true;
    }
    // 到达片头之后即标记，避免中途误跳
    if (t >= Math.max(PREF.introSec, 3)) introSkipped = true;

    // 片尾跳过：到达总时长 - 预留秒数 → 下一集或结束
    if (PREF.skipOutro && PREF.outroSec > 0 && d - t <= PREF.outroSec) {
      const eps = PLAY_LINES[curLine]?.eps || [];
      if (PREF.autoNext && curEp + 1 < eps.length) switchEpisode(curEp + 1);
      else { video.pause(); }
      return;
    }

    // 结尾预热下一集（预加载），仅在开启自动下一集时
    if (PREF.autoNext && warmedEp !== curEp) {
      const eps = PLAY_LINES[curLine]?.eps || [];
      if (curEp + 1 < eps.length && d - t < 60) { warmedEp = curEp; warmNext(eps[curEp + 1].url); }
    }
  });
  video.addEventListener('ended', () => {
    if (!PREF.autoNext) return;
    const eps = PLAY_LINES[curLine]?.eps || [];
    if (curEp + 1 < eps.length) switchEpisode(curEp + 1);
  });
}

let warmVideo = null;
function warmNext(url) {
  try {
    if (warmVideo) { warmVideo.removeAttribute('src'); warmVideo.load(); }
    warmVideo = document.createElement('video');
    warmVideo.preload = 'auto'; warmVideo.muted = true; warmVideo.playsInline = true;
    warmVideo.src = url; warmVideo.load();
  } catch (_) {}
}

let lastRawUrl = '';
function saveProgress() {
  const v = $('#video');
  if (CUR && v && v.duration && v.currentTime > 3) {
    WATCH[CUR.id] = { t: v.currentTime, d: v.duration, ep: curEp };
    saveWatch();
  }
}
window.addEventListener('beforeunload', saveProgress);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });

/* —— M3U8 拉取 + 广告过滤 + 播放 —— */
async function resolvePlayUrl(rawUrl) {
  // 只有 m3u8 走过滤；MP4 直链直接播
  if (!/\.m3u8(\?|$)/i.test(rawUrl)) return { src: rawUrl, m3u8: false };
  let text = '';
  try {
    const r = await NCF.withTimeout(fetch(rawUrl, { cache: 'no-store' }), (SourceManager.getCfg?.().timeout) || 10000);
    if (r.ok) text = await r.text();
  } catch (_) {}
  if (!text) return { src: rawUrl, m3u8: true, filtered: false };
  // master 列表：跟随第一个子码率
  const variant = NCF.firstVariantUrl ? NCF.firstVariantUrl(text, rawUrl) : null;
  let mediaUrl = rawUrl, mediaText = text;
  if (variant) {
    try {
      const r2 = await NCF.withTimeout(fetch(variant, { cache: 'no-store' }), 10000);
      if (r2.ok) { mediaText = await r2.text(); mediaUrl = variant; }
    } catch (_) {}
  }
  playlistText = mediaText;
  if (!PREF.adfOn) {
    $('#filterNote').textContent = '已关闭（原始列表）';
    $('#dlM3u8Btn').hidden = true;
    return { src: mediaUrl, m3u8: true, filtered: false, base: mediaUrl };
  }
  const res = NCF.stripForeignSegments(mediaText, mediaUrl);
  if (res.changed) {
    lastFilterRemoved = res.removed;
    const absolute = NCF.absolutizeSegments(res.text, mediaUrl);
    if (filteredBlobUrl) URL.revokeObjectURL(filteredBlobUrl);
    filteredBlobUrl = URL.createObjectURL(new Blob([absolute], { type: 'application/vnd.apple.mpegurl' }));
    $('#filterNote').textContent = `已过滤 ${res.removed} 段`;
    $('#dlM3u8Btn').hidden = false;
    return { src: filteredBlobUrl, m3u8: true, filtered: true, base: mediaUrl, text: absolute };
  }
  $('#filterNote').textContent = res.reason === 'distribution_unclear' ? '分布不明显·未过滤' : '未发现广告分段';
  $('#dlM3u8Btn').hidden = true;
  return { src: mediaUrl, m3u8: true, filtered: false, base: mediaUrl };
}

function downloadFilteredM3u8() {
  const text = $('#filterNote').dataset.blobText || '';
  const content = text || (playlistText ? NCF.absolutizeSegments(playlistText, lastRawUrl) : '');
  if (!content) { toast('没有可下载的过滤列表'); return; }
  const blob = new Blob([content], { type: 'application/vnd.apple.mpegurl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'noctide-filtered.m3u8';
  a.click(); URL.revokeObjectURL(a.href);
  toast('已下载过滤后的 M3U8');
}

/* 播放一个剧集地址 */
async function srcOf(lineIdx, epIdx) {
  const eps = PLAY_LINES[lineIdx]?.eps || [];
  const ep = eps[epIdx];
  if (!ep) return;
  lastRawUrl = ep.url;
  introSkipped = false; userSeeked = false; warmedEp = -1;
  renderEps();
  hideFallback();

  const resolved = await resolvePlayUrl(ep.url);
  if (resolved.m3u8 && resolved.filtered && resolved.text) {
    $('#dlM3u8Btn').dataset.blobText = resolved.text;
  }

  const video = $('#video');
  if (hls) { hls.destroy(); hls = null; }

  clearTimeout(playTimer);
  playTimer = setTimeout(() => {
    if (video.readyState < 2) showFallback(ep.url, '这条线路暂时打不开', '片源服务器连不上，可以换条线路或换一部试试');
  }, 12000);
  video.oncanplay = () => clearTimeout(playTimer);
  clearInterval(saveTick);
  saveTick = setInterval(saveProgress, 5000);

  // ⚠️ 先判 MSE 支持：Chrome 的 canPlayType('m3u8') 会误报 maybe，不能直接用
  if (window.Hls?.isSupported() && resolved.m3u8) {
    hls = new Hls({ maxBufferLength: 30 });
    hls.loadSource(resolved.src);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hls.on(Hls.Events.ERROR, (_, d) => {
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR && !hls._retried) { hls._retried = true; hls.startLoad(); return; }
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR && !hls._recovered) { hls._recovered = true; hls.recoverMediaError(); return; }
      showFallback(ep.url, '这条线路暂时打不开', '片源连不上，可换线路或用外部播放器');
    });
  } else {
    video.src = resolved.src;
    video.onerror = () => showFallback(ep.url, '这条线路暂时打不开');
  }
  video.play().catch(() => {});
}

/* 换资源站线路（整站换源） */
async function switchLine() {
  const apis = SourceManager.apis();
  const cur = S.line;
  for (let k = 1; k <= apis.length; k++) {
    const i = (cur + k) % apis.length;
    if (i === cur || S.dead.has(i)) continue;
    S.line = i;
    try {
      const d = await get(apis[i], { ac: 'list' });
      if (!d || !(d.class || d.list)) throw new Error('empty');
      SourceManager.setActiveIndex(i);
      closePlayer();
      S.cat = ''; S.kw = ''; S.cats = []; S.rail = [];
      if ($('#q')) { $('#q').value = ''; $('#clr').hidden = true; }
      await loadCats();
      await load(true);
      window.scrollTo({ top: 0 });
      toast('已换到备用线路');
      return;
    } catch (_) { S.dead.add(i); }
  }
  S.line = cur;
  $('#pfWhy').textContent = '其它线路也连不上';
  $('#pfTip').textContent = '片源方可能在维护，过一会儿再试试';
  $('#pfSwitch').hidden = true;
}

function closePlayer() {
  saveProgress();
  clearInterval(saveTick);
  clearTimeout(playTimer);
  const v = $('#video');
  $('#pmask').hidden = true;
  hideFallback();
  $('#progRow').hidden = true;
  const sr1 = $('#skipRow'); if (sr1) sr1.hidden = true;
  document.body.style.overflow = '';
  if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
  if (hls) { hls.destroy(); hls = null; }
  if (warmVideo) { try { warmVideo.removeAttribute('src'); warmVideo.load(); } catch (_) {} warmVideo = null; }
  if (filteredBlobUrl) { URL.revokeObjectURL(filteredBlobUrl); filteredBlobUrl = ''; }
  const wasList = S.view;
  CUR = null; PLAY_LINES = [];
  if (wasList === 'fav' || wasList === 'hist') render();
}

/* ── 今日推荐（按日期取一页，每天不一样） ── */
async function loadRail() {
  const d = new Date();
  const seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
  const pg = (seed % CFG.randMaxPage) + 1;
  try {
    const d2 = await api({ ac: 'videolist', pg, pagesize: 14 });
    const list = (d2?.list || []).filter(x => x.vod_id).map(norm);
    if (list.length >= 8) {
      S.rail = list.slice(0, 14);
      if (S.view === 'home' && !filterActive()) render();
    }
  } catch (_) {}
}

/* ── 随机来一部 ─────────────────────── */
async function randomOne() {
  toast('摇一部…');
  try {
    let pool = S.pool;
    if (Math.random() < 0.55) {
      const pg = 1 + Math.floor(Math.random() * CFG.randMaxPage);
      const d = await api({ ac: 'videolist', pg, pagesize: 20, t: S.cat || null });
      const list = (d?.list || []).filter(x => x.vod_id);
      if (list.length) pool = list.map(norm);
    }
    if (!pool.length) return toast('这会儿没摇到，再试一次');
    play(rand(pool).id);
  } catch (_) { toast('这会儿没摇到，再试一次'); }
}

/* ── Toast ──────────────────────────── */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
}

/* ── 视图切换 ───────────────────────── */
function setView(v) {
  S.view = v;
  $$('.tab[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  render();
  window.scrollTo({ top: 0 });
}

/* ── 事件 ───────────────────────────── */
document.addEventListener('click', e => {
  // 分类
  const cat = e.target.closest('.cat');
  if (cat) {
    const id = cat.dataset.id;
    if (String(id).startsWith('kw:')) { S.cat = id; S.kw = id.slice(3); }
    else { S.cat = id; S.kw = ''; }
    if ($('#q')) { $('#q').value = ''; $('#clr').hidden = true; }
    S.filter = { year: '', res: '', sort: '' }; paintFilterBtn();
    renderCats();
    S.view = 'home';
    $$('.tab[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === 'home'));
    load(true); window.scrollTo({ top: 0 });
    return;
  }

  const tab = e.target.closest('.tab[data-view]');
  if (tab) { setView(tab.dataset.view); return; }

  if (e.target.closest('[data-view="home"]:not(.tab)')) { setView('home'); return; }

  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'random') { randomOne(); return; }
  if (act === 'switchline') { switchLine(); return; }
  if (act === 'hist-clear') {
    HIST = []; WATCH = {}; saveHist(); saveWatch(); renderHist(); toast('历史已清空'); return;
  }
  if (act === 'rank-refresh') {
    const shuffled = [...S.pool].sort(() => Math.random() - 0.5).slice(0, 12);
    const rank = $('.rank');
    if (rank) { rank.innerHTML = shuffled.map((v, i) => card(v, { rank: i + 1 })).join(''); bindLazy(rank); }
    return;
  }
  if (act === 'more') {
    S.page++;
    fetchPage(S.page).then(r => { merge(r); render(); }).catch(() => toast('加载失败，稍后再试'));
    return;
  }

  // 卡片（播放器外的普通卡片）
  const c = e.target.closest('.card');
  if (c && !c.closest('#pmask')) { play(c.dataset.id); return; }

  // 播放器内（方案B）
  // 相关推荐卡片：在播放器内部，点击切换到那部片
  const relCard = e.target.closest('#relGrid .card');
  if (relCard) { play(relCard.dataset.id); const sc = $('.player-scroll'); if (sc) sc.scrollTop = 0; return; }

  // 可点击的演员/导演/分类/标签 → 关闭播放器并站内搜索
  const chip = e.target.closest('.p-chip');
  if (chip) {
    const kw = chip.dataset.chip;
    closePlayer();
    S.kw = kw; S.cat = ''; S.filter = { year: '', res: '', sort: '' }; paintFilterBtn();
    if ($('#q')) { $('#q').value = kw; $('#clr').hidden = false; }
    renderCats(); setView('home'); load(true);
    toast('搜索：' + kw);
    return;
  }

  const lineBtn = e.target.closest('.line-btn');
  if (lineBtn) { switchPlayLine(Number(lineBtn.dataset.line)); return; }

  const ep = e.target.closest('.ep');
  if (ep) { switchEpisode(Number(ep.dataset.ep)); return; }

  if (e.target.closest('#pfSwitch')) { switchLine(); return; }
  if (e.target.closest('#pFav')) {
    if (!CUR) return;
    const on = toggleFav(CUR);
    $('#pFav').classList.toggle('faved', on);
    return;
  }
  if (e.target.closest('#pclose') || e.target === $('#pmask')) { closePlayer(); return; }

  if (e.target.closest('#clr')) {
    $('#q').value = ''; $('#clr').hidden = true; S.kw = ''; load(true); return;
  }

  if (e.target.closest('#menuBtn')) {
    const cc = $('#cats');
    const hidden = cc.classList.toggle('hide');
    e.target.closest('#menuBtn').setAttribute('aria-expanded', String(!hidden));
    return;
  }
  if (e.target.closest('#brandBtn')) {
    S.cat = ''; S.kw = ''; S.filter = { year: '', res: '', sort: '' };
    if ($('#q')) { $('#q').value = ''; $('#clr').hidden = true; }
    paintFilterBtn(); renderCats(); setView('home'); load(true); return;
  }

  // 筛选
  if (e.target.closest('#filterBtn')) {
    if (S.pool.length < CFG.poolMin) fillPool().then(buildFilter);
    buildFilter();
    $('#fMask').hidden = false;
    return;
  }
  const opt = e.target.closest('.f-opt');
  if (opt) {
    const k = opt.dataset.k, v = opt.dataset.v;
    if (k === 'cat') { S.cat = v; S.kw = ''; if ($('#q')) { $('#q').value = ''; $('#clr').hidden = true; } renderCats(); }
    else S.filter[k] = v;
    $$(`.f-opt[data-k="${k}"]`).forEach(b => b.classList.toggle('on', b === opt));
    return;
  }
  if (e.target.closest('#fReset')) {
    S.cat = ''; S.kw = '';
    S.filter = { year: '', res: '', sort: '' };
    if ($('#q')) { $('#q').value = ''; $('#clr').hidden = true; }
    renderCats(); paintFilterBtn(); buildFilter(); return;
  }
  if (e.target.closest('#fApply') || e.target.closest('#fClose') || e.target === $('#fMask')) {
    $('#fMask').hidden = true;
    paintFilterBtn();
    S.view = 'home';
    $$('.tab[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === 'home'));
    if (S.pool.length < CFG.poolMin) {
      $('#app').innerHTML = skeleton(12);
      fillPool().then(render);
    } else render();
    window.scrollTo({ top: 0 });
    return;
  }
});

/* ── 播放器设置控件事件（一次性绑定） ─────────────────────── */
$('#adfCheck').checked = PREF.adfOn;
$('#autoNextCheck').checked = PREF.autoNext;
$('#skipIntroCheck').checked = PREF.skipIntro;
$('#introSec').value = PREF.introSec;
$('#skipOutroCheck').checked = PREF.skipOutro;
$('#outroSec').value = PREF.outroSec;
$('#adfCheck').addEventListener('change', e => {
  PREF.adfOn = e.target.checked; savePref();
  toast(PREF.adfOn ? 'M3U8 广告过滤已开启' : '已关闭过滤，将使用原始列表');
  // 若正在播放 m3u8，按新设置重新加载当前集
  if (CUR && lastRawUrl && /\.m3u8(\?|$)/i.test(lastRawUrl)) srcOf(curLine, curEp);
});
$('#autoNextCheck').addEventListener('change', e => { PREF.autoNext = e.target.checked; savePref(); });
$('#skipIntroCheck').addEventListener('change', e => { PREF.skipIntro = e.target.checked; savePref(); toast(PREF.skipIntro ? `片头跳过已开启（${PREF.introSec}s）` : '片头跳过已关闭'); });
$('#introSec').addEventListener('change', e => { PREF.introSec = Math.max(0, Number(e.target.value) || 0); e.target.value = PREF.introSec; introSkipped = false; savePref(); });
$('#skipOutroCheck').addEventListener('change', e => { PREF.skipOutro = e.target.checked; savePref(); toast(PREF.skipOutro ? `片尾预留已开启（${PREF.outroSec}s）` : '片尾跳过已关闭'); });
$('#outroSec').addEventListener('change', e => { PREF.outroSec = Math.max(0, Number(e.target.value) || 0); e.target.value = PREF.outroSec; savePref(); });
$('#dlM3u8Btn').addEventListener('click', downloadFilteredM3u8);
// video 元素常驻，仅绑定一次；换 src 不重建元素
$('#video').addEventListener('loadedmetadata', () => {}); // 占位确保元素存在
bindVideoEvents();

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#fMask').hidden) { $('#fMask').hidden = true; return; }
  if (!$('#pmask').hidden) closePlayer();
});

let timer;
$('#q').addEventListener('input', e => {
  $('#clr').hidden = !e.target.value;
  clearTimeout(timer);
  timer = setTimeout(() => {
    S.kw = e.target.value.trim(); S.cat = '';
    S.filter = { year: '', res: '', sort: '' }; paintFilterBtn();
    renderCats();
    S.view = 'home';
    $$('.tab[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === 'home'));
    load(true);
  }, 420);
});
$('#searchForm').addEventListener('submit', e => e.preventDefault());

/* ── 版本号显示：读取 version.json，跟随版本更新，无需手改 ── */
async function paintVersion() {
  const el = $('#appVer'); if (!el) return;
  try {
    const r = await fetch('./version.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('http');
    const d = await r.json();
    const v = String(d.version || '').trim();
    if (v) el.textContent = 'v' + (v.startsWith('v') ? v.slice(1) : v);
  } catch (_) { el.textContent = ''; } // 读取失败则不显示，避免误导
}

/* ── 启动 ───────────────────────────── */
paintFavN();
paintFilterBtn();
paintVersion();
$('#app').innerHTML = skeleton();
SourceManager.init().then(() => {
  S.line = Math.max(0, SourceManager.active());
  if (!SourceManager.apis().length) {
    $('#app').innerHTML = '<div class="empty"><h2>还没有启用的资源站</h2><p>点击右上角「资源站管理」，添加苹果 CMS V10 采集接口。</p></div>';
    return;
  }
  loadCats();
  load(true).then(() => loadRail());
});
document.addEventListener('source-manager-change', () => {
  S.line = Math.max(0, SourceManager.active()); S.dead.clear(); S.pool = []; S.page = 1; S.cats = [];
  if (SourceManager.apis().length) { loadCats(); load(true).then(() => loadRail()); }
});
