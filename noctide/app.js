/* ============================================================
   夜潮 NOCTIDE —— 前端逻辑
   ============================================================ */
const CFG = {
  // 线路表：/api/ 主源，/api2/ /api3/ 备源（.api-proxy 第 2、3 行）。
  // 主源拿不到数据时自动往后切；播放失败时也会提示"换条线路"。
  apis: ['/api/', '/api2/', '/api3/'],
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
  const r = await withTimeout(fetch(buildURL(base, params), { headers: { Accept: 'application/json' } }));
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.json();
}

// 带线路自动切换的请求（主源拿不到数据 → 顺次试备源）
async function api(params, allowFailover = true) {
  try {
    return await get(CFG.apis[S.line], params);
  } catch (e) {
    if (allowFailover) {
      for (let i = 0; i < CFG.apis.length; i++) {
        if (i === S.line || S.dead.has(i)) continue;
        try {
          const d = await get(CFG.apis[i], params);
          S.line = i;
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
  };
}

function merge(list) {
  const seen = new Set(S.pool.map(x => String(x.id)));
  let add = 0;
  list.forEach(v => {
    const n = norm(v);
    if (!n.id || seen.has(String(n.id))) return;
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

async function fetchPage(pg) {
  // videolist 返回完整字段（含 vod_pic 封面 + vod_play_url 播放地址），
  // ac=list 只有 8 个字段没有图，列表页会全是空白
  const d = await api(listParams(pg));
  if (d?.pagecount) S.pages = d.pagecount;
  if (d?.total != null) S.total = d.total;
  return (d?.list || []).filter(x => x.vod_id);
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
let hls = null;
let CUR = null;        // 当前播放的条目
let playTimer = null;
let saveTick = null;

async function play(id) {
  const mask = $('#pmask');
  mask.hidden = false;
  document.body.style.overflow = 'hidden';
  $('#pTitle').textContent = '加载中…';
  $('#eps').innerHTML = '';
  $('#pMeta').innerHTML = '';
  hideFallback();

  try {
    // 列表里的数据基本都带 vod_play_url，命中就不用再请求详情（快一倍）
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
    $('#pMeta').innerHTML = [
      v.cat ? `<span class="m-cat">${esc(v.cat)}</span>` : '',
      v.rem ? `<span class="m-cat">${esc(v.rem)}</span>` : '',
      v.hits ? `<span>${v.hits.toLocaleString()} 次播放</span>` : '',
    ].join('');

    // 多线路：vod_play_url 用 $$$ 分隔，取第一条线路里的全集
    const eps = (v.url || '').split('$$$')[0].split('#')
      .map(s => {
        const i = s.lastIndexOf('$');       // 必须用 lastIndexOf：地址里可能含 $
        if (i < 0) return null;
        const url = s.slice(i + 1).trim();
        return url ? { name: s.slice(0, i).trim() || '播放', url } : null;
      }).filter(Boolean);
    if (!eps.length) throw new Error('no source');

    if (eps.length > 1) {
      $('#eps').innerHTML = eps.map((e, i) =>
        `<button class="ep${i === 0 ? ' on' : ''}" data-u="${esc(e.url)}">${esc(e.name)}</button>`).join('');
    }
    pushHist(v);
    src(eps[0].url);
  } catch (e) {
    CUR = null;
    $('#pTitle').textContent = '播放';
    showFallback('', '这一部暂时没有可用的播放地址', '换一部试试，其它片子不受影响');
  }
}

// 播放失败兜底：绝不能留一个黑掉的空播放器
function showFallback(url, why, tip) {
  const box = $('#pfall');
  $('#pfWhy').textContent = why || '这条线路暂时打不开';
  $('#pfTip').textContent = tip || '片源服务器的问题，换一集或换一部试试';
  const a = $('#pfLink');
  if (url) { a.href = url; a.hidden = false; } else { a.hidden = true; }
  $('#pfSwitch').hidden = !hasOtherLine();
  box.hidden = false;
  // 播不了还留着进度条会误导用户以为能拖动，一并收掉
  $('#video').removeAttribute('controls');
}

const hasOtherLine = () => CFG.apis.some((_, i) => i !== S.line && !S.dead.has(i));

// 换线路：整站数据换一套源重新来（不同源的片子不同，没法接着播同一部）
async function switchLine() {
  const cur = S.line;
  for (let k = 1; k <= CFG.apis.length; k++) {
    const i = (cur + k) % CFG.apis.length;
    if (i === cur || S.dead.has(i)) continue;
    S.line = i;
    try {
      const d = await get(CFG.apis[i], { ac: 'list' });
      if (!d || !(d.class || d.list)) throw new Error('empty');
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

const hideFallback = () => {
  clearTimeout(playTimer);
  const f = $('#pfall'); if (f) f.hidden = true;
  const v = $('#video'); if (v) v.setAttribute('controls', '');
};

function src(url) {
  const video = $('#video');
  hideFallback();
  if (hls) { hls.destroy(); hls = null; }

  // 总超时兜底：不管因为什么原因（hls 不报错、切片挂了、证书过期…），
  // 到点还没播起来就给用户一个交代，绝不留黑屏。
  clearTimeout(playTimer);
  playTimer = setTimeout(() => {
    if (video.readyState < 2) {
      showFallback(url, '这条线路暂时打不开', '片源服务器连不上，可以换条线路或换一部试试');
    }
  }, 12000);
  video.oncanplay = () => clearTimeout(playTimer);

  // 断点续播：接着上次的位置看
  const w = CUR && WATCH[CUR.id];
  if (w && w.t > 30) {
    video.onloadedmetadata = () => {
      try { video.currentTime = w.t; } catch (_) {}
    };
  }
  clearInterval(saveTick);
  saveTick = setInterval(() => {
    if (!CUR || !video.duration || video.paused) return;
    WATCH[CUR.id] = { t: video.currentTime, d: video.duration };
    saveWatch();
  }, 5000);

  // ⚠️ 顺序不能反：Chrome 对 m3u8 的 canPlayType 会返回 "maybe"（其实播不好），
  // 先判 canPlayType 会导致 hls.js 永远用不上、重试与多码率全失效。
  // 只有 Safari/iOS（不支持 MSE，Hls.isSupported() 为 false）才走原生。
  if (window.Hls?.isSupported()) {
    hls = new Hls({ maxBufferLength: 30 });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hls.on(Hls.Events.ERROR, (_, d) => {
      if (!d.fatal) return;
      // 网络类错误先自愈重试一次，仍失败才提示（切片偶发超时很常见）
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR && !hls._retried) {
        hls._retried = true; hls.startLoad(); return;
      }
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR && !hls._recovered) {
        hls._recovered = true; hls.recoverMediaError(); return;
      }
      showFallback(url, '这条线路暂时打不开',
        '片源服务器连不上，可以换一集或换一部试试；也可以复制地址用外部播放器看');
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    video.onerror = () => showFallback(url, '这条线路暂时打不开');
  } else {
    video.src = url;
    video.onerror = () => showFallback(url, '这条线路暂时打不开');
  }
  video.play().catch(() => {});
}

function closePlayer() {
  clearInterval(saveTick);
  const v = $('#video');
  if (CUR && v && v.duration) {
    WATCH[CUR.id] = { t: v.currentTime, d: v.duration };
    saveWatch();
  }
  $('#pmask').hidden = true;
  hideFallback();
  document.body.style.overflow = '';
  if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
  if (hls) { hls.destroy(); hls = null; }
  const wasList = S.view;
  CUR = null;
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

  // 卡片
  const c = e.target.closest('.card');
  if (c) { play(c.dataset.id); return; }

  // 播放器内
  const ep = e.target.closest('.ep');
  if (ep) { $$('.ep').forEach(x => x.classList.remove('on')); ep.classList.add('on'); src(ep.dataset.u); return; }
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

/* ── 启动 ───────────────────────────── */
paintFavN();
paintFilterBtn();
$('#app').innerHTML = skeleton();
loadCats();
load(true).then(() => loadRail());
