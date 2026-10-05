/* ============================================================
   绯夜 · CRIMSON NIGHT
   ============================================================ */
const CFG = {
  // 线路表：/api/ 主源，/api2/ /api3/ 备源（对应服务器上的 .api-proxy 第 2、3 行）
  apis: ['/api/', '/api2/', '/api3/'],
  pageSize: 30,          // 每页数量
  hotCats: 14,           // 分类条最多展示几个
  topic: '',             // 通用站：展示源站全量
  topicCats: [],
  favKey: 'feiye_fav_v1',
  maxFav: 300,
  brand: '绯夜',
};

/* ── 工具 ───────────────────────────── */
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const esc = t => String(t ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = t => String(t ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

async function api(params, allowFailover = true) {
  const build = base => {
    const u = new URL(base, location.origin);
    Object.entries(params).forEach(([k, v]) => v != null && v !== '' && u.searchParams.set(k, v));
    return u;
  };
  try {
    const r = await fetch(build(CFG.apis[S.line]), { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    if (allowFailover) {
      for (let i = S.line + 1; i < CFG.apis.length; i++) {
        if (S.dead.has(i)) continue;
        try {
          const r2 = await fetch(build(CFG.apis[i]), { headers: { Accept: 'application/json' } });
          if (!r2.ok) { S.dead.add(i); continue; }
          S.line = i;
          return await r2.json();
        } catch (_) { S.dead.add(i); }
      }
    }
    throw e;
  }
}

/* ── 状态 ───────────────────────────── */
const S = {
  cat: '', kw: '', page: 1, pages: 1, total: 0, list: [], cats: [],
  loading: false, line: 0, dead: new Set(),
  view: 'home',          // home | fav
  li: 0, ei: 0, lines: [], cur: null,
};

/* ── 收藏（存本地，不上传） ─────────── */
let FAV = [];
try { FAV = JSON.parse(localStorage.getItem(CFG.favKey) || '[]') || []; } catch (_) { FAV = []; }
const isFav = id => FAV.some(x => String(x.id) === String(id));
function saveFav() {
  try { localStorage.setItem(CFG.favKey, JSON.stringify(FAV.slice(0, CFG.maxFav))); } catch (_) {}
}
function toggleFav(v) {
  if (!v) return false;
  const id = String(v.vod_id ?? v.id);
  const i = FAV.findIndex(x => String(x.id) === id);
  if (i >= 0) FAV.splice(i, 1);
  else FAV.unshift({
    id, name: v.vod_name || v.name || '未命名', pic: v.vod_pic || v.pic || '',
    cat: v.type_name || v.cat || '', rem: v.vod_remarks || v.rem || '',
    year: (v.vod_time || v.year || '').slice(0, 4), pu: v.vod_play_url || v.pu || '',
  });
  saveFav();
  return i < 0;
}
const findItem = id =>
  S.list.find(x => String(x.vod_id) === String(id)) ||
  FAV.find(x => String(x.id) === String(id)) ||
  (S.cur && String(S.cur.vod_id ?? S.cur.id) === String(id) ? S.cur : null);

/* ── 骨架屏 / 状态块 ─────────────────── */
const skeleton = (n = 18) => `<div class="grid">${'<div class="sk"></div>'.repeat(n)}</div>`;

function state(kind, title, sub) {
  const ico = kind === 'empty'
    ? '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'
    : '<circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/>';
  return `<div class="state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">${ico}</svg>
    <p>${esc(title)}</p><small>${esc(sub)}</small></div>`;
}

/* ── 卡片 ───────────────────────────── */
function card(v) {
  const rem = v.vod_remarks || v.rem || '';
  const cat = v.type_name || v.cat || '';
  const yr = (v.vod_time || v.year || '').slice(0, 4);
  const name = v.vod_name || v.name || '';
  const pic = v.vod_pic || v.pic || '';
  const id = v.vod_id ?? v.id;
  const code = name.match(/^[A-Za-z]{2,6}[-_\s]?\d{2,5}/);
  return `<article class="card" data-id="${esc(id)}" tabindex="0">
    <div class="thumb">
      ${code ? `<span class="badge badge-code">${esc(code[0])}</span>` : ''}
      ${rem ? `<span class="badge badge-rem">${esc(rem)}</span>` : ''}
      <img data-src="${esc(pic)}" alt="${esc(name)}" loading="lazy">
      <button class="fav-btn${isFav(id) ? ' on' : ''}" data-fav="${esc(id)}" type="button" aria-label="收藏">
        <svg viewBox="0 0 24 24" fill="${isFav(id) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9z"/></svg>
      </button>
      <span class="play-hint"><span>
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </span></span>
    </div>
    <div class="c-name">${esc(name)}</div>
    <div class="c-sub">
      ${cat ? `<span class="c-cat">${esc(cat)}</span>` : ''}
      ${yr ? `<span>${esc(yr)}</span>` : ''}
    </div>
  </article>`;
}

/* ── 懒加载 ─────────────────────────── */
const io = new IntersectionObserver(es => {
  es.forEach(e => {
    if (!e.isIntersecting) return;
    const img = e.target;
    io.unobserve(img);
    const src = img.dataset.src;
    if (!src) { img.style.display = 'none'; return; }
    img.src = src;
    img.onload = () => img.classList.add('in');
    img.onerror = () => { img.style.display = 'none'; };
  });
}, { rootMargin: '260px' });

const bindLazy = root => $$('img[data-src]', root).forEach(i => io.observe(i));

/* ── 分类 ───────────────────────────── */
async function loadCats() {
  try {
    if (CFG.topic && CFG.topicCats.length) {
      S.cats = CFG.topicCats.map(w => ({ type_id: 'kw:' + w, type_name: w }));
      renderCats();
      return;
    }
    const d = await api({ ac: 'list' });
    if (d.class?.length) { S.cats = leafCats(d.class); renderCats(); }
  } catch (e) { /* 分类拉不到不影响列表 */ }
}

// 苹果CMS 的父分类自身挂 0 部片，片子全在子分类里 → 只展示叶子分类，避免点进去空白
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
    `<button class="cat${String(c.type_id) === String(S.cat) && S.view === 'home' ? ' on' : ''}" data-id="${esc(c.type_id)}" type="button">${esc(c.type_name)}</button>`
  ).join('');
}

/* ── 列表 ───────────────────────────── */
async function load() {
  if (S.loading) return;
  S.loading = true;
  const app = $('#app');
  if (!S.list.length) app.innerHTML = skeleton();

  try {
    // videolist 返回完整字段（含封面 + 播放地址）；ac=list 没有图，列表页会全是空白
    const params = { ac: 'videolist', pg: S.page, pagesize: CFG.pageSize };
    const wd = [CFG.topic, S.kw].filter(Boolean).join(' ');
    if (wd) params.wd = wd;
    if (!CFG.topic && S.cat) params.t = S.cat;

    const d = await api(params);
    S.pages = d.pagecount || 1;
    S.total = d.total || 0;
    S.list.push(...(d.list || []));
    render();
  } catch (e) {
    app.innerHTML = state('fail', '内容加载失败', '请检查网络后重试');
  } finally {
    S.loading = false;
  }
}

function pagerHtml() {
  const p = S.page, ps = S.pages || 1;
  return `<div class="pager">
    <button id="pPrev" type="button"${p <= 1 ? ' disabled' : ''}>上一页</button>
    <span class="pnum">第 <b>${p}</b> / ${ps > 99999 ? '99999+' : ps} 页</span>
    <button id="pNext" type="button"${p >= ps ? ' disabled' : ''}>下一页</button>
  </div>`;
}

function heroHtml(v) {
  const desc = clean(v.vod_blurb || v.vod_content || '');
  const meta = [
    v.type_name, (v.vod_time || '').slice(0, 4) + ' 年',
    v.vod_area, v.vod_lang, v.vod_remarks,
  ].filter(Boolean).slice(0, 4);
  return `<section class="hero">
    <div class="hero-bg" style="background-image:url('${esc(v.vod_pic || '').replace(/'/g, '%27')}')"></div>
    <div class="hero-shade"></div>
    <div class="hero-poster">
      <img src="${esc(v.vod_pic || '')}" alt="${esc(v.vod_name)}"
           onerror="this.parentNode.style.display='none'">
    </div>
    <div class="hero-body">
      <span class="hero-kicker">今夜精选</span>
      <h1>${esc(v.vod_name)}</h1>
      <div class="hero-meta">${meta.map(m => `<span>${esc(m)}</span>`).join('')}</div>
      ${desc && desc !== v.vod_name ? `<p class="hero-desc">${esc(desc.slice(0, 120))}</p>` : ''}
      <div class="hero-btns">
        <button class="btn btn-main" id="heroPlay" type="button">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>立即播放
        </button>
        <button class="btn" id="heroFav" type="button" data-fav="${esc(v.vod_id)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9z"/></svg>${isFav(v.vod_id) ? '已收藏' : '收藏'}
        </button>
      </div>
    </div>
  </section>`;
}

function render() {
  const app = $('#app');

  if (S.view === 'fav') {
    if (!FAV.length) {
      app.innerHTML = state('empty', '收藏夹还是空的', '在片子上点右上角的星标，就会收进这里');
      return;
    }
    app.innerHTML = `
      <div class="sec-hd"><h2>我的收藏</h2><span class="meta">${FAV.length} 部 · 存在你自己的设备上</span></div>
      <div class="grid">${FAV.map(card).join('')}</div>`;
    bindLazy(app);
    return;
  }

  if (!S.list.length) {
    app.innerHTML = state('empty',
      S.kw ? `没有找到「${S.kw}」` : '这个分类暂时没有内容',
      '换个关键词或分类试试');
    return;
  }

  const isHome = S.page === 1 && !S.kw && !S.cat;
  const hero = isHome ? S.list[0] : null;
  const rest = hero ? S.list.slice(1) : S.list;
  const title = S.kw ? `搜索：${S.kw}`
    : (S.cats.find(c => String(c.type_id) === String(S.cat))?.type_name || '最新上架');

  app.innerHTML = `
    ${hero ? heroHtml(hero) : ''}
    <div class="sec-hd">
      <h2>${esc(title)}</h2>
      <span class="meta">共 ${Number(S.total || 0).toLocaleString()} 部 · 每页 ${CFG.pageSize} 部</span>
    </div>
    <div class="grid">${rest.map(card).join('')}</div>
    ${rest.length ? pagerHtml() : ''}
    ${S.page < S.pages ? '<div class="more"><button id="moreBtn" type="button">加载更多</button></div>' : ''}`;
  bindLazy(app);
}

function gotoPage(p) {
  p = Math.max(1, Math.min(p, S.pages || 1));
  if (p === S.page && S.list.length) return;
  S.page = p; S.list = [];
  window.scrollTo({ top: 0 });
  load();
}

/* ── 播放 ───────────────────────────── */
let hls = null;
let playTimer = null;

function parseLines(v) {
  const froms = String(v.vod_play_from || '').split('$$$');
  return String(v.vod_play_url || '').split('$$$').map((seg, i) => ({
    name: froms[i] || ('线路' + (i + 1)),
    eps: seg.split('#').map(s => {
      // ⚠️ 必须用 lastIndexOf：播放地址本身含 $，用 indexOf 会切错
      const k = s.lastIndexOf('$');
      if (k < 0) return null;
      const url = s.slice(k + 1).trim();
      if (!/^https?:\/\//i.test(url)) return null;
      return { name: s.slice(0, k).trim() || '播放', url };
    }).filter(Boolean),
  })).filter(l => l.eps.length);
}

async function play(id, pre) {
  const mask = $('#pmask');
  mask.hidden = false;
  document.body.style.overflow = 'hidden';
  $('#pTitle').textContent = '加载中…';
  $('#eps').innerHTML = '';
  $('#pLines').hidden = true;
  $('#pMeta').hidden = true;
  $('#pFav').hidden = true;
  hideFallback();

  try {
    let v = pre || findItem(id);
    if (!v?.vod_play_url && v?.pu) v = { ...v, vod_play_url: v.pu };
    // 列表本身已带播放地址，命中就不用再请求详情（快一倍）
    if (!v?.vod_play_url) {
      const d = await api({ ac: 'detail', ids: id });
      v = d.list?.[0];
    }
    if (!v) throw new Error('no data');

    S.cur = v;
    S.lines = parseLines(v);
    if (!S.lines.length) throw new Error('no source');
    S.li = 0; S.ei = 0;

    $('#pTitle').textContent = v.vod_name || '播放';
    $('#pFav').hidden = false;
    $('#pFav').classList.toggle('on', isFav(v.vod_id));

    const desc = clean(v.vod_blurb || v.vod_content || '');
    const facts = [v.type_name, (v.vod_time || '').slice(0, 4) + ' 年', v.vod_area, v.vod_lang, v.vod_remarks].filter(Boolean);
    if (desc && desc !== v.vod_name || facts.length) {
      const meta = $('#pMeta');
      meta.innerHTML = `${facts.length ? `<div style="color:var(--faint);font-size:12px">${facts.map(esc).join(' · ')}</div>` : ''}${desc && desc !== v.vod_name ? esc(desc.slice(0, 220)) : ''}`;
      meta.hidden = false;
    }

    renderSwitch();
    src(S.lines[0].eps[0].url);
  } catch (e) {
    $('#pTitle').textContent = '播放';
    showFallback('', '这一部暂时没有可用的播放地址', '换一部试试，其它片子不受影响');
  }
}

function renderSwitch() {
  const L = S.lines[S.li];
  const lines = $('#pLines');
  if (S.lines.length > 1) {
    lines.hidden = false;
    lines.innerHTML = `<b>线路</b>${S.lines.map((l, i) =>
      `<button class="ep${i === S.li ? ' on' : ''}" data-line="${i}" type="button">${esc(l.name)}</button>`).join('')}`;
  } else {
    lines.hidden = true;
    lines.innerHTML = '';
  }
  const eps = $('#eps');
  if (L.eps.length > 1) {
    eps.innerHTML = L.eps.map((e, i) =>
      `<button class="ep${i === S.ei ? ' on' : ''}" data-ep="${i}" type="button">${esc(e.name)}</button>`).join('');
  } else {
    eps.innerHTML = '';
  }
}

// 播放失败兜底：绝不能留一个黑掉的空播放器
function showFallback(url, why, tip) {
  $('#pfWhy').textContent = why || '这条线路暂时打不开';
  $('#pfTip').textContent = tip || '片源服务器的问题，换一集或换一部试试';
  const a = $('#pfLink');
  if (url) { a.href = url; a.hidden = false; } else { a.hidden = true; }
  $('#pfSwitch').hidden = !hasOtherLine();
  $('#pfall').hidden = false;
  $('#video').removeAttribute('controls');
}

const hasOtherLine = () => CFG.apis.some((_, i) => i !== S.line && !S.dead.has(i));

const hideFallback = () => {
  clearTimeout(playTimer);
  $('#pfall').hidden = true;
  $('#video').setAttribute('controls', '');
};

function src(url) {
  const video = $('#video');
  hideFallback();
  if (hls) { hls.destroy(); hls = null; }

  // 总超时兜底：不管什么原因（hls 不报错、切片挂了、证书过期…）到点没起播就给用户交代
  clearTimeout(playTimer);
  playTimer = setTimeout(() => {
    if (video.readyState < 2) {
      showFallback(url, '这条线路暂时打不开', '片源服务器连不上，可以换条线路或换一部试试');
    }
  }, 16000);
  // 起播后立刻收回提示层：首帧慢时提示会先弹出来，视频起来了必须自动消失，
  // 不能拿一个盖着提示的播放器糊用户
  const recover = () => {
    clearTimeout(playTimer);
    if (!$('#pfall').hidden && video.readyState >= 2) hideFallback();
  };
  video.oncanplay = recover;
  video.onplaying = recover;

  // ⚠️ 顺序不能反：Chrome 对 m3u8 的 canPlayType 返回 "maybe"（其实播不好），
  // 先判 canPlayType 会导致 hls.js 永远用不上、重试与多码率全失效。
  if (window.Hls?.isSupported()) {
    hls = new Hls({ maxBufferLength: 30 });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hls.on(Hls.Events.ERROR, (_, d) => {
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR && !hls._retried) { hls._retried = true; hls.startLoad(); return; }
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR && !hls._recovered) { hls._recovered = true; hls.recoverMediaError(); return; }
      showFallback(url, '这条线路暂时打不开', '片源服务器连不上，可以换一集或换一部试试；也可以复制地址用外部播放器看');
    });
  } else {
    video.src = url;                       // Safari / iOS 原生 HLS
    video.onerror = () => showFallback(url, '这条线路暂时打不开');
  }
  video.play().catch(() => {});
}

// 换线路：整站数据换一套源重新来（不同源的片子不同，没法接着播同一部）
async function switchLine() {
  const cur = S.line;
  for (let k = 1; k <= CFG.apis.length; k++) {
    const i = (cur + k) % CFG.apis.length;
    if (i === cur || S.dead.has(i)) continue;
    S.line = i;
    try {
      const d = await api({ ac: 'list' }, false);
      if (!d || !(d.class || d.list)) throw new Error('empty');
      closePlayer();
      S.cat = ''; S.kw = ''; S.cats = []; S.page = 1; S.list = []; S.view = 'home';
      $('#q').value = ''; $('#clr').hidden = true;
      loadCats(); load();
      window.scrollTo({ top: 0 });
      return;
    } catch (_) { S.dead.add(i); }
  }
  S.line = cur;
  $('#pfWhy').textContent = '其它线路也连不上';
  $('#pfTip').textContent = '片源方可能在维护，过一会儿再试试';
  $('#pfSwitch').hidden = true;
}

function closePlayer() {
  $('#pmask').hidden = true;
  hideFallback();
  document.body.style.overflow = '';
  const v = $('#video');
  v.pause(); v.removeAttribute('src'); v.load();
  if (hls) { hls.destroy(); hls = null; }
  S.lines = []; S.cur = null;
}

async function randomPlay() {
  try {
    const maxPg = Math.max(1, Math.min(S.pages || 60, 300));
    const d = await api({ ac: 'videolist', pg: 1 + Math.floor(Math.random() * maxPg), pagesize: 24 });
    const l = d.list || [];
    if (!l.length) return;
    const pick = l[Math.floor(Math.random() * l.length)];
    play(pick.vod_id, pick);
  } catch (_) { /* 拿不到就静默 */ }
}

/* ── 事件 ───────────────────────────── */
document.addEventListener('click', e => {
  const favBtn = e.target.closest('.fav-btn');
  if (favBtn) {
    e.stopPropagation();
    const id = favBtn.dataset.fav;
    const item = findItem(id);
    const added = toggleFav(item);
    $$('.fav-btn').forEach(b => {
      if (b.dataset.fav !== id) return;
      b.classList.toggle('on', added);
      const svg = b.querySelector('svg');
      if (svg) svg.setAttribute('fill', added ? 'currentColor' : 'none');
    });
    if (added && S.view === 'fav') render();
    if (!added && S.view === 'fav') render();
    return;
  }

  const heroFav = e.target.closest('#heroFav');
  if (heroFav) {
    const added = toggleFav(findItem(heroFav.dataset.fav));
    heroFav.lastChild.textContent = added ? '已收藏' : '收藏';
    return;
  }

  const cat = e.target.closest('.cat');
  if (cat) {
    const id = cat.dataset.id;
    if (id.startsWith('kw:')) { S.cat = id; S.kw = id.slice(3); }
    else { S.cat = id; S.kw = ''; }
    S.view = 'home'; S.page = 1; S.list = [];
    $('#q').value = ''; $('#clr').hidden = true;
    renderCats(); window.scrollTo({ top: 0 }); load();
    return;
  }

  const cardEl = e.target.closest('.card');
  if (cardEl) { play(cardEl.dataset.id); return; }

  if (e.target.closest('#heroPlay') || e.target.closest('.play-hint')) {
    const hero = $('.hero');
    if (hero && S.list[0]) play(S.list[0].vod_id, S.list[0]);
    return;
  }

  if (e.target.closest('#moreBtn')) { if (S.page < S.pages) { S.page++; load(); } return; }
  if (e.target.closest('#pPrev')) { gotoPage(S.page - 1); return; }
  if (e.target.closest('#pNext')) { gotoPage(S.page + 1); return; }

  const lineBtn = e.target.closest('[data-line]');
  if (lineBtn) { S.li = +lineBtn.dataset.line; S.ei = 0; renderSwitch(); src(S.lines[S.li].eps[0].url); return; }

  const ep = e.target.closest('.ep[data-ep]');
  if (ep) { S.ei = +ep.dataset.ep; renderSwitch(); src(S.lines[S.li].eps[S.ei].url); return; }

  if (e.target.closest('#pFav')) {
    const added = toggleFav(S.cur);
    $('#pFav').classList.toggle('on', added);
    if (S.view === 'fav') render();
    return;
  }

  if (e.target.closest('#pfSwitch')) { switchLine(); return; }
  if (e.target.closest('#pclose') || e.target === $('#pmask')) { closePlayer(); return; }

  if (e.target.closest('#clr')) { $('#q').value = ''; $('#clr').hidden = true; S.kw = ''; S.page = 1; S.list = []; load(); return; }

  if (e.target.closest('#favBtn')) {
    S.view = S.view === 'fav' ? 'home' : 'fav';
    $('#favBtn').classList.toggle('on', S.view === 'fav');
    if (S.view === 'fav') { S.list = []; S.page = 1; }
    window.scrollTo({ top: 0 });
    renderCats();
    S.view === 'fav' ? render() : load();
    return;
  }

  if (e.target.closest('#randBtn')) { randomPlay(); return; }

  if (e.target.closest('#menuBtn')) {
    $('#hd').classList.toggle('menu-off');
    $('#menuBtn').setAttribute('aria-expanded', String(!$('#hd').classList.contains('menu-off')));
    return;
  }

  if (e.target.closest('.brand')) {
    S.view = 'home'; S.cat = ''; S.kw = ''; S.page = 1; S.list = [];
    $('#q').value = ''; $('#clr').hidden = true; $('#favBtn').classList.remove('on');
    renderCats(); window.scrollTo({ top: 0 }); load();
    return;
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#pmask').hidden) closePlayer();
});

let timer;
$('#q').addEventListener('input', e => {
  $('#clr').hidden = !e.target.value;
  clearTimeout(timer);
  timer = setTimeout(() => {
    S.kw = e.target.value.trim(); S.cat = ''; S.view = 'home'; S.page = 1; S.list = [];
    $('#favBtn').classList.remove('on');
    renderCats(); load();
  }, 420);
});
$('#searchForm').addEventListener('submit', e => e.preventDefault());

/* ── 启动 ───────────────────────────── */
if (window.innerWidth <= 820) $('#hd').classList.add('menu-off');
$('#app').innerHTML = skeleton();
loadCats();
load();
