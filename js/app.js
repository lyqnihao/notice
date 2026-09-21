/* =========================================================
 * 潮汐 TIDEFLOW · 首页逻辑
 * ========================================================= */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const grid = $('#grid');
  const statusBar = $('#statusBar');
  const toast = $('#toast');
  const loadmoreWrap = $('#loadmoreWrap');
  const loadmoreTip = $('#loadmoreTip');

  /* ---------- 状态 ---------- */
  const state = {
    enabled: loadEnabled(),
    filterOn: loadFilter(),
    query: '',
    category: '全部',
    sourceOnly: '',
    classId: '',       // 源分类 tid
    classIsTop: false, // 源分类是否为顶层（顶层匹配 type_id_1，子分类匹配 type_name 分类名）
    className: '',     // 源子分类名（子分类匹配用）
    view: 'feed',      // feed | history | favs
    manage: false,     // 历史/收藏管理（多选删除）模式
    selected: new Set(),
    pages: {},          // 每个源已加载页数
    items: [],          // 全部已加载条目（去重后）
    seenKeys: new Set(),
    loading: false,
    scanResults: {},    // sourceId -> { ok, latencyMs, count, directOk, note }
  };

  function loadEnabled() {
    try {
      const raw = localStorage.getItem(CONFIG.storeKey);
      if (raw) {
        const arr = JSON.parse(raw);
        const valid = arr.filter((id) => SOURCES.some((s) => s.id === id));
        if (valid.length) return valid.slice(0, CONFIG.maxActive);
      }
    } catch (e) { /* ignore */ }
    return [...DEFAULT_ENABLED];
  }
  function saveEnabled() {
    localStorage.setItem(CONFIG.storeKey, JSON.stringify(state.enabled));
  }
  function loadFilter() {
    try {
      const v = localStorage.getItem(CONFIG.filterKey);
      if (v !== null) return v === '1';
    } catch (e) { /* ignore */ }
    return true;
  }
  function saveFilter() {
    localStorage.setItem(CONFIG.filterKey, state.filterOn ? '1' : '0');
  }
  const SCAN_KEY = 'tideflow_scan_v1';
  function saveScanResults() {
    try { localStorage.setItem(SCAN_KEY, JSON.stringify(state.scanResults)); } catch (e) { /* ignore */ }
  }
  function restoreScanResults() {
    try {
      const raw = localStorage.getItem(SCAN_KEY);
      if (raw) state.scanResults = JSON.parse(raw) || {};
    } catch (e) { /* ignore */ }
  }

  /* ---------- 历史 / 收藏 ---------- */
  const HIST_KEY = 'tideflow_history_v1';
  const FAV_KEY = 'tideflow_favs_v1';
  function loadHistory() {
    try {
      const arr = JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function recordHistory(it) {
    try {
      const arr = loadHistory();
      const idx = arr.findIndex((x) => x.key === it.key);
      if (idx > -1) arr.splice(idx, 1);
      arr.unshift(it);
      localStorage.setItem(HIST_KEY, JSON.stringify(arr.slice(0, 40)));
    } catch (e) { /* ignore */ }
  }
  function loadFavs() {
    try {
      const o = JSON.parse(localStorage.getItem(FAV_KEY) || '{}');
      return Object.values(o);
    } catch (e) { return []; }
  }
  function isFav(key) {
    try { return !!JSON.parse(localStorage.getItem(FAV_KEY) || '{}')[key]; } catch (e) { return false; }
  }

  /* ---------- 提示 ---------- */
  let toastTimer = null;
  function showToast(msg, type) {
    toast.textContent = msg;
    toast.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  /* ---------- 渲染：分类 chips / 源下拉 ---------- */
  const COMMON_CATS = ['电影','电视剧','动漫','综艺','纪录片','动作片','喜剧片','悬疑片','爱情片','科幻片','恐怖片','古装剧'];

  function renderCatChips() {
    const box = $('#catChips');
    if (!box) return;
    // 从已加载内容里收集真实分类
    const set = {};
    state.items.forEach((it) => {
      (it.tags || []).forEach((t) => { if (t && !/^\d{4}$/.test(t)) set[t] = 1; });
    });
    const dynamicCats = Object.keys(set).slice(0, 12);
    const opts = ['全部'].concat(COMMON_CATS.slice(0, 6)).concat(dynamicCats).slice(0, 18);
    box.innerHTML = opts.map((c) =>
      '<span class="chip' + ((state.query === c || (c === '全部' && !state.query)) ? ' active' : '') + '" data-cat="' + c + '">' + c + '</span>'
    ).join('');
    box.querySelectorAll('.chip').forEach((el) => {
      el.addEventListener('click', () => {
        const c = el.dataset.cat;
        goSearch(c === '全部' ? '' : c);
        renderCatChips();
      });
    });
  }

  // 第二行分类：从源接口拉到的真实分类（tid），跟随当前选择的源
  async function loadSourceCategories() {
    const box = $('#catChips2');
    if (!box) return;
    let lunaDef = null;
    if (state.sourceOnly && state.sourceOnly.indexOf('luna:') === 0) {
      lunaDef = SOURCES.find((s) => s.id === state.sourceOnly);
    } else {
      lunaDef = SOURCES.find((s) => state.enabled.includes(s.id) && s.id.indexOf('luna:') === 0);
    }
    if (!lunaDef) { box.innerHTML = ''; return; }
    try {
      const ad = ADAPTERS[lunaDef.id];
      if (!ad || !ad._api) return;
      // 分类树 + 一页数据并行拉取：用数据真实分类体系校验分类树，无效分类（数据里不存在）不显示
      const [res, vres] = await Promise.all([
        fetchWithTimeout(lunaRelay(ad._api + '?ac=list'), CONFIG.requestTimeout),
        fetchWithTimeout(lunaRelay(ad._api + '?ac=videolist&pg=1&limit=50'), CONFIG.requestTimeout),
      ]);
      const j = await res.json();
      const vj = await vres.json();
      const cls = (j && j.class) || [];
      const vlist = Array.isArray(vj && vj.list) ? vj.list : [];
      const tid1Set = new Set(vlist.map((v) => String(v.type_id_1 == null ? '' : v.type_id_1)).filter(Boolean));
      const tnameSet = new Set(vlist.map((v) => String(v.type_name || '').trim()).filter(Boolean));
      const flat = [];
      const seen = new Set();
      cls.forEach((c) => {
        const isTop = (c.type_pid === undefined || c.type_pid === null || String(c.type_pid) === '0');
        if (isTop && c.type_id && c.type_name) {
          // 顶层分类（电影/连续剧/综艺…）直接保留：苹果 CMS 标准 type_id_1 体系，第一页数据抽样可能不覆盖
          if (!seen.has('t:' + c.type_name)) { seen.add('t:' + c.type_name); flat.push({ id: c.type_id, name: c.type_name, isTop: true }); }
        }
        (c.list || []).forEach((sub) => {
          // 子分类：仅保留数据 type_name 真实存在的（部分源分类树含数据体系外的虚分类）
          if (sub.type_id && sub.type_name && tnameSet.has(String(sub.type_name).trim())) {
            if (!seen.has('n:' + sub.type_name)) { seen.add('n:' + sub.type_name); flat.push({ id: sub.type_id, name: sub.type_name, isTop: false }); }
          }
        });
      });
      // 数据聚合的叶子分类（type_name，type_id 体系之外的精确分类）
      vlist.forEach((v) => {
        const tn = String(v.type_name || '').trim();
        if (tn && !seen.has('n:' + tn)) {
          seen.add('n:' + tn);
          flat.push({ id: tn, name: tn, isTop: false });
        }
      });
      // 切换源后原分类失效，清掉
      if (state.classId && !flat.some((o) => String(o.id) === String(state.classId))) {
        state.classId = '';
      }
      const opts = [{ id: '', name: '全部' }].concat(flat.slice(0, 24));
      box.innerHTML = opts.map((o) =>
        '<span class="chip' + (String(state.classId) === String(o.id) ? ' active' : '') + '" data-tid="' + o.id + '" data-istop="' + (o.isTop ? '1' : '0') + '">' + esc(o.name) + '</span>'
      ).join('');
      box.querySelectorAll('.chip').forEach((el) => {
        el.addEventListener('click', () => {
          state.classId = el.dataset.tid;
          state.classIsTop = el.dataset.istop === '1';
          state.className = el.textContent; // 子分类按分类名匹配（type_name）
          // 关键：分类树来自 lunaDef（当前所选/首个 LunaTV 源），
          // 点击分类时必须聚焦到该源，否则 tid 对所有源同时生效、其余源返回全部，看起来像没筛选
          if (lunaDef && state.classId) state.sourceOnly = lunaDef.id;
          state.query = '';
          $('#searchInput').value = '';
          renderChips();
          renderSourceSelect();
          loadSourceCategories();
          loadFeed(true);
        });
      });
    } catch (e) { /* ignore */ }
  }

  function renderChips() {
    const box = $('#chips');
    // 分类标签跟随当前启用的源：全部 + 各启用源
    const defs = activeSourceDefs().filter((d) => !(state.filterOn && ADULT_SOURCE_HINT.test(d.name)));
    const opts = [{ id: '', name: '全部' }].concat(defs.map((d) => ({ id: d.id, name: d.name })));
    box.innerHTML = opts.map((o) =>
      '<span class="chip' + (state.sourceOnly === o.id ? ' active' : '') + '" data-src="' + o.id + '">' + esc(o.name) + '</span>'
    ).join('');
    box.querySelectorAll('.chip').forEach((el) => {
      el.addEventListener('click', () => {
        state.sourceOnly = el.dataset.src;
        state.query = '';
        state.classId = '';
        $('#searchInput').value = '';
        renderChips();
        loadSourceCategories();
        loadFeed(true);
      });
    });
  }

  function renderSourceSelect() {
    const sel = $('#sourceSelect');
    sel.innerHTML = '<option value="">全部来源</option>' + SOURCES
      .filter((s) => state.enabled.includes(s.id))
      .filter((s) => !(state.filterOn && ADULT_SOURCE_HINT.test(s.name)))
      .map((s) => '<option value="' + s.id + '">' + s.name + '</option>')
      .join('');
    sel.value = state.sourceOnly;
  }

  /* ---------- 过滤开关（位于更新源面板） ---------- */
  function renderFilterSwitch() {
    const check = $('#filterCheck');
    if (check) check.checked = state.filterOn;
  }

  /* ---------- 数据获取 ---------- */
  function activeSourceDefs() {
    return SOURCES.filter((s) => state.enabled.includes(s.id));
  }

  async function fetchSource(src, page) {
    const adapter = ADAPTERS[src.id];
    if (!adapter) return [];
    return adapter.fetch({
      query: state.query,
      category: state.category,
      page,
      sourceOnly: state.sourceOnly,
      classId: state.classId,
      classIsTop: state.classIsTop,
      className: state.className,
    });
  }

  let autoRetries = 0;
  async function loadFeed(reset) {
    if (state.loading) return;
    state.loading = true;
    const t0 = performance.now();

    if (reset) {
      state.items = [];
      state.seenKeys.clear();
      state.pages = {};
      autoRetries = 0;
      renderFilterSwitch();
      renderSourceSelect();
      updateStatus(null, true);
    }

    const defs = activeSourceDefs().filter((d) => !state.sourceOnly || d.id === state.sourceOnly);
    const all = [];
    const fails = [];
    const totals = {};

    try {
      await Promise.all(defs.map(async (src) => {
        const page = (state.pages[src.id] || 0) + 1;
        try {
          const items = await fetchSource(src, page);
          const ad = ADAPTERS[src.id];
          // 分类模式按后端真实翻页数推进；普通模式即 page
          state.pages[src.id] = (ad && ad._nextPage) || page;
          if (ad && ad._total) totals[src.name] = ad._total;
          // 分类筛空：该分类在此源无内容 → 降级回退全部内容并提示
          if (state.classId && ad && ad._classifiedEmpty && reset) {
            const name = state.className || '';
            state.classId = '';
            state.classIsTop = false;
            state.className = '';
            setTimeout(() => {
              showToast('「' + name + '」在此源暂无内容，已显示全部');
              loadSourceCategories();
              loadFeed(true);
            }, 500);
          }
          all.push({ src, items });
        } catch (e) {
          fails.push(src.name);
        }
      }));

      const added = [];
      const lunaSeen = {}; // 同片名合并
      for (const { src, items } of all) {
        for (const it of items) {
          if (!it || state.seenKeys.has(it.key)) continue;
          // 数据层过滤：推广条目 + 成人内容（安全模式）
          if (isPromoContent(it)) continue;
          if (state.filterOn && isAdultContent(it)) continue;
          // LunaTV 跨子站去重：同片名合并成一张卡，多线路挂到 streams
          if (it.sourceId && it.sourceId.indexOf('luna:') === 0) {
            const dk = lunaDedupKey(it);
            if (lunaSeen[dk]) {
              lunaSeen[dk].streams.push({ name: it.source, url: it.direct, episodes: it.episodes || [] });
              continue;
            }
            it.streams = [{ name: it.source, url: it.direct, episodes: it.episodes || [] }];
            lunaSeen[dk] = it;
          }
          state.seenKeys.add(it.key);
          state.items.push(it);
          added.push(it);
        }
      }

      // 搜索模式按相关度排序（精确/前缀/包含优先），浏览模式轮转混合排布（多源内容交错）
      let merged;
      if (state.query && reset) {
        const q = state.query.trim().toLowerCase();
        const scored = state.items.slice().map((it, idx) => ({ it, idx, s: searchScore(it, q) }));
        scored.sort((a, b) => (b.s - a.s) || (a.idx - b.idx));
        merged = scored.map((x) => x.it);
      } else {
        merged = roundRobin(state.items.slice(), defs.map((d) => d.id));
      }

      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      updateStatus({ total: state.items.length, fails, elapsed, counts: all.map(({ src, items }) => [src.name, items.length]), totals });

      // 首次加载轮转混合排布；加载更多只追加本次新增条目
      renderCards(reset ? merged : added, reset);
      renderLoadMore(added.length === 0);

      // 兜底：全部源接口都报错（网络抖动）才自动重试，最多 2 次；
      // 搜索无结果（源正常返回空）不重试，避免死循环
      if (reset && defs.length && fails.length === defs.length && autoRetries < 2) {
        autoRetries++;
        setTimeout(() => {
          if (!state.loading) { showToast('接口全部超时，正在自动重试（第 ' + autoRetries + ' 次）…'); loadFeed(true); }
        }, 1200);
      }
    } finally {
      state.loading = false;
    }
  }

  /* LunaTV 同片名去重 key：去掉空白/标点后小写 */
  function lunaDedupKey(it) {
    return (it.title || '').replace(/[\s\u3000:：《》"'·.\-!！?？,，。]/g, '').toLowerCase();
  }

  /* 搜索结果相关度：标题完全相等 > 前缀 > 包含 > 标签/演员命中 */
  function searchScore(it, q) {
    const t = (it.title || '').toLowerCase();
    if (t === q) return 100;
    if (t.startsWith(q)) return 60;
    if (t.includes(q)) return 30;
    const tagHit = (it.tags || []).concat(it.actors || []).some((x) => String(x).toLowerCase().includes(q));
    return tagHit ? 15 : 0;
  }

  function roundRobin(list, order) {    const buckets = {};
    const out = [];
    for (const it of list) {
      (buckets[it.sourceId] = buckets[it.sourceId] || []).push(it);
    }
    let i = 0;
    while (true) {
      let any = false;
      for (const id of order) {
        const b = buckets[id];
        if (b && i < b.length) { out.push(b[i]); any = true; }
      }
      if (!any) break;
      i++;
    }
    return out;
  }

  /* ---------- 渲染 ---------- */
  function updateStatus(info, loading) {
    if (loading) {
      statusBar.innerHTML = '<span class="warn">正在聚合各源内容…</span>';
      return;
    }
    if (!info) return;
    let html = '<span>版本号：v' + CONFIG.version + '</span>';
    if (info.counts && info.counts.length) {
      html += info.counts.map(([n, c]) => {
        if (state.filterOn && ADULT_SOURCE_HINT.test(n)) return '';
        const t = info.totals && info.totals[n];
        // 分类模式下 total=-1 不显示库藏数
        return '<span>' + esc(n) + (t && t > 0 ? ' 库藏约 <b>' + fmtCount(t) + '</b>' : '') + '</span>';
      }).join('');
    }
    if (info.fails && info.fails.length) {
      html += '<span class="err">' + info.fails.map((n) => n + ' 超时').join('；') + '</span>';
    }
    statusBar.innerHTML = html;
  }

  function renderCards(list, reset, opts) {
    if (reset) grid.innerHTML = '';
    if (!list.length && !grid.children.length) {
      grid.innerHTML =
        '<div class="empty-tip" style="grid-column:1/-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5v5M14.5 9.5v5"/></svg>' +
        '<p>没有找到内容 —— 换个关键词，或去「更新源」面板体检一下各源可达性。</p></div>';
      loadmoreWrap.style.display = 'none';
      return;
    }
    grid.querySelector('.empty-tip')?.remove();
    const frag = document.createDocumentFragment();
    for (const it of list) frag.appendChild(cardEl(it, opts));
    grid.appendChild(frag);
  }

  function cardEl(it, opts) {
    opts = opts || {};
    const art = document.createElement('article');
    art.className = 'card';
    art.dataset.key = it.key;

    // 标签：拆逗号，过滤掉搜不到的通用类型词，优先演员
    const GENRE_WORDS = new Set(['剧情','喜剧','动作','爱情','科幻','恐怖','惊悚','悬疑','犯罪','战争','历史','古装','武侠','奇幻','冒险','动画','纪录片','短片','微电影','国产','港台','欧美','日本','韩国','大陆','海外','普通话','粤语','英语','中文字幕']);
    const splitTags = (arr) => (arr || []).flatMap((t) => String(t).split(/[,，、/]/)).map((s) => s.trim()).filter(Boolean);
    const actorTags = splitTags(it.actors);
    let otherTags = splitTags(it.tags).filter((t) => !GENRE_WORDS.has(t) && !/^\d{4}$/.test(t) && !actorTags.includes(t));
    const tags = actorTags.slice(0, 2).concat(otherTags.slice(0, 1)).slice(0, 3);
    const tagsHtml = tags.map((t) => {
      const isActor = actorTags.includes(t);
      return '<span class="tag' + (isActor ? ' actor' : '') + '" data-q="' + escAttr(t) + '">' + esc(t) + '</span>';
    }).join('');

    const badge = it.source + ((it.streams && it.streams.length > 1) ? ' ×' + it.streams.length : '');
    if (opts.selectable && state.selected.has(it.key)) art.classList.add('selected');
    // 集数角标（卡片本体）
    let epBadge = '';
    const nEps = (it.episodes && it.episodes.length) || 0;
    if (nEps > 1) {
      epBadge = '<span class="dur-badge ep-badge">' + (it.ep != null && it.ep >= 0 ? '第' + (it.ep + 1) + '/' + nEps + '集' : nEps + '集') + '</span>';
    }
    // 续播进度信息（纯展示，无按钮；点卡片即续播）
    let progHtml = '';
    if (it.time && it.duration && it.duration > it.time + 30) {
      const pct = Math.min(100, Math.round((it.time / it.duration) * 100));
      progHtml = '<div class="prog-row"><span class="prog-bar"><i style="width:' + pct + '%"></i></span>' +
        '<span class="prog-txt">上次看到 ' + fmtDur(it.time) + '</span></div>';
    }
    art.innerHTML =
      '<div class="thumb' + (it.thumb ? '' : ' noimg') + '">' +
        (it.thumb ? '<img loading="lazy" src="' + escAttr(it.thumb) + '" alt="" onerror="this.parentElement.classList.add(\'noimg\');this.remove()">' : '') +
        '<div class="thumb-ph">' + esc((it.title || '?').charAt(0).toUpperCase()) + '</div>' +
        '<span class="src-badge">' + esc(badge) + '</span>' +
        (opts.selectable ? '<span class="sel-check">' + (state.selected.has(it.key) ? '✓' : '') + '</span>' : '') +
        (opts.onDelete && !opts.selectable ? '<button class="del-btn" title="从列表中移除">×</button>' : '') +
        (it.duration ? '<span class="dur-badge">' + fmtDur(it.duration) + '</span>' : '') +
        epBadge +
        '<span class="play-hint"><span class="ph-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="#221503"><path d="M8 5v14l11-7z"/></svg></span></span>' +
      '</div>' +
      '<div class="body">' +
        '<h3 class="card-title">' + esc(it.title) + '</h3>' +
        progHtml +
        '<div class="card-tags">' + tagsHtml + '</div>' +
      '</div>';

    art.addEventListener('click', (e) => {
      const chip = e.target.closest('.tag');
      if (chip) {
        e.stopPropagation();
        goSearch(chip.dataset.q);
        return;
      }
      if (e.target.closest('.del-btn')) {
        e.stopPropagation();
        if (opts.onDelete) opts.onDelete(it);
        return;
      }
      if (opts.selectable) {
        e.stopPropagation();
        if (state.selected.has(it.key)) state.selected.delete(it.key);
        else state.selected.add(it.key);
        art.classList.toggle('selected', state.selected.has(it.key));
        const chk = art.querySelector('.sel-check');
        if (chk) chk.textContent = state.selected.has(it.key) ? '✓' : '';
        updateViewStatus(state.view === 'history' ? '播放历史' : '我的收藏', state.view === 'history' ? clearHistory : clearFavs);
        return;
      }
      // 点卡片直接续播（带上次集数与进度）
      openPlayer(it, { st: it.st, ep: it.ep, t: it.time });
    });
    return art;
  }

  /* ---------- 版本提示条 ---------- */
  function showVersionBanner(oldV, newV) {
    if ($('#verBanner')) return;
    const bar = document.createElement('div');
    bar.id = 'verBanner';
    bar.className = 'ver-banner';
    bar.innerHTML = '站点已更新到 <b>v' + esc(newV) + '</b>（本地记录 v' + esc(oldV) + '）—— <button id="verRefreshBtn" class="btn mini">刷新加载最新</button>';
    const tb = document.querySelector('.toolbar');
    if (tb && tb.parentNode) tb.parentNode.insertBefore(bar, tb.nextSibling);
    const btn = $('#verRefreshBtn');
    if (btn) btn.addEventListener('click', () => {
      try { localStorage.setItem('tideflow_ver_v1', CONFIG.version); } catch (e) { /* ignore */ }
      location.reload();
    });
  }

  function renderLoadMore(empty) {
    if (empty) {
      loadmoreWrap.style.display = 'none';
      return;
    }
    loadmoreWrap.style.display = 'block';
    loadmoreTip.textContent = '已加载 ' + state.items.length + ' 部 · 可继续加载更多';
    $('#loadMoreBtn').disabled = false;
  }

  /* ---------- 跳转 ---------- */
  function openPlayer(it, opts) {
    opts = opts || {};
    try {
      localStorage.setItem(CONFIG.currentKey, JSON.stringify(it));
      recordHistory(it);
    } catch (e) { /* ignore */ }
    let url = 'player.html#v=' + CONFIG.version;
    const parts = [];
    if (opts.st != null) parts.push('st=' + opts.st);
    if (opts.ep != null) parts.push('ep=' + opts.ep);
    if (opts.t != null && opts.t > 0) parts.push('t=' + Math.round(opts.t));
    if (parts.length) url += '&' + parts.join('&');
    location.href = url;
  }
  function goSearch(q) {
    state.query = q;
    state.category = '全部';
    state.classId = '';
    state.view = 'feed';
    $('#histBtn').classList.remove('active');
    $('#favBtn').classList.remove('active');
    $('#searchInput').value = q;
    renderChips();
    loadFeed(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- 历史 / 收藏视图 ---------- */
  function viewOpts(view) {
    const opts = { onDelete: view === 'history' ? removeHistory : removeFav };
    if (state.manage) opts.selectable = true;
    return opts;
  }
  function renderViewList(list, emptyMsg, view) {
    loadmoreWrap.style.display = 'none';
    if (!list.length) {
      grid.innerHTML =
        '<div class="empty-tip" style="grid-column:1/-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5v5M14.5 9.5v5"/></svg>' +
        '<p>' + esc(emptyMsg) + '</p></div>';
      return;
    }
    renderCards(list, true, viewOpts(view));
  }
  function updateViewStatus(title, clearFn) {
    if (state.manage) {
      statusBar.innerHTML = '<span>版本号：v' + CONFIG.version + '</span><span>' + esc(title) + '（管理）</span>' +
        '<button class="btn ghost mini" id="selAllBtn">全选</button>' +
        '<button class="btn ghost mini danger" id="selDelBtn">删除选中（' + state.selected.size + '）</button>' +
        '<button class="btn ghost mini" id="exitManageBtn">完成</button>';
      $('#selAllBtn').addEventListener('click', () => {
        const all = viewFiltered(state.view === 'history' ? loadHistory() : loadFavs());
        state.selected.clear();
        all.forEach((x) => state.selected.add(x.key));
        updateViewStatus(title, clearFn);
        reapplyManageClass();
      });
      $('#selDelBtn').addEventListener('click', () => {
        if (!state.selected.size) { showToast('还没有选中任何条目', 'err'); return; }
        if (state.view === 'history') removeHistoryByKeys([...state.selected]);
        else removeFavByKeys([...state.selected]);
      });
      $('#exitManageBtn').addEventListener('click', () => { state.manage = false; state.selected.clear(); renderCurrentView(); });
      return;
    }
    statusBar.innerHTML = '<span>版本号：v' + CONFIG.version + '</span><span>' + esc(title) + '</span>' +
      '<button class="btn ghost mini" id="manageBtn">管理</button>' +
      (clearFn ? '<button class="btn ghost mini" id="clearViewBtn">清空全部</button>' : '');
    const m = $('#manageBtn');
    if (m) m.addEventListener('click', () => { state.manage = true; renderCurrentView(); });
    const b = $('#clearViewBtn');
    if (b) b.addEventListener('click', clearFn);
  }
  function renderCurrentView() {
    if (state.view === 'history') {
      updateViewStatus('播放历史', clearHistory);
      renderViewList(viewFiltered(loadHistory()), '还没有播放记录 —— 去首页看几部，它们会出现在这里', 'history');
    } else {
      updateViewStatus('我的收藏', clearFavs);
      renderViewList(viewFiltered(loadFavs()), '还没有收藏 —— 在播放页点右上角星标收藏', 'favs');
    }
  }
  /* 视图（历史/收藏）按成人过滤开关过滤 */
  function viewFiltered(arr) {
    return state.filterOn ? arr.filter((x) => !isAdultContent(x)) : arr;
  }
  function reapplyManageClass() {
    grid.querySelectorAll('.card').forEach((c) => {
      const on = state.selected.has(c.dataset.key);
      c.classList.toggle('selected', on);
      const chk = c.querySelector('.sel-check');
      if (chk) chk.textContent = on ? '✓' : '';
    });
  }
  function removeHistoryByKeys(keys) {
    try {
      const arr = loadHistory().filter((x) => !keys.includes(x.key));
      localStorage.setItem(HIST_KEY, JSON.stringify(arr));
    } catch (e) { /* ignore */ }
    state.selected.clear();
    showToast('已删除选中 ' + keys.length + ' 条历史', 'ok');
    renderCurrentView();
  }
  function removeFavByKeys(keys) {
    try {
      const o = JSON.parse(localStorage.getItem(FAV_KEY) || '{}');
      keys.forEach((k) => delete o[k]);
      localStorage.setItem(FAV_KEY, JSON.stringify(o));
    } catch (e) { /* ignore */ }
    state.selected.clear();
    showToast('已取消收藏 ' + keys.length + ' 条', 'ok');
    renderCurrentView();
  }
  function removeHistory(it) {
    try {
      const arr = loadHistory().filter((x) => x.key !== it.key);
      localStorage.setItem(HIST_KEY, JSON.stringify(arr));
    } catch (e) { /* ignore */ }
    showToast('已从历史移除', 'ok');
    renderCurrentView();
  }
  function clearHistory() {
    try { localStorage.removeItem(HIST_KEY); } catch (e) { /* ignore */ }
    showToast('播放历史已清空', 'ok');
    renderCurrentView();
  }
  function removeFav(it) {
    try {
      const o = JSON.parse(localStorage.getItem(FAV_KEY) || '{}');
      delete o[it.key];
      localStorage.setItem(FAV_KEY, JSON.stringify(o));
    } catch (e) { /* ignore */ }
    showToast('已取消收藏', 'ok');
    renderCurrentView();
  }
  function clearFavs() {
    try { localStorage.removeItem(FAV_KEY); } catch (e) { /* ignore */ }
    showToast('收藏已清空', 'ok');
    renderCurrentView();
  }
  function backToFeed() {
    state.view = 'feed';
    state.manage = false;
    state.selected.clear();
    $('#histBtn').classList.remove('active');
    $('#favBtn').classList.remove('active');
    loadFeed(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function bindViewButtons() {
    $('#histBtn').addEventListener('click', () => {
      if (state.view === 'history') { backToFeed(); return; }
      state.view = 'history';
      state.manage = false;
      state.selected.clear();
      $('#histBtn').classList.add('active');
      $('#favBtn').classList.remove('active');
      updateViewStatus('播放历史', clearHistory);
      renderViewList(viewFiltered(loadHistory()), '还没有播放记录 —— 去首页看几部，它们会出现在这里', 'history');
    });
    $('#favBtn').addEventListener('click', () => {
      if (state.view === 'favs') { backToFeed(); return; }
      state.view = 'favs';
      state.manage = false;
      state.selected.clear();
      $('#favBtn').classList.add('active');
      $('#histBtn').classList.remove('active');
      updateViewStatus('我的收藏', clearFavs);
      renderViewList(viewFiltered(loadFavs()), '还没有收藏 —— 在播放页点右上角星标收藏', 'favs');
    });
  }

  /* ---------- 搜索 ---------- */
  function bindSearch() {
    const input = $('#searchInput');
    const doSearch = () => {
      const q = input.value.trim();
      state.query = q;
      state.view = 'feed';
      // 搜索回到全局：清掉源聚焦/分类，避免只在当前源里搜导致结果少而"不准"
      state.sourceOnly = '';
      state.classId = '';
      state.classIsTop = false;
      state.className = '';
      $('#histBtn').classList.remove('active');
      $('#favBtn').classList.remove('active');
      renderChips();
      renderSourceSelect();
      loadSourceCategories();
      loadFeed(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    $('#searchBtn').addEventListener('click', doSearch);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  }

  /* ---------- 源选择 ---------- */
  function bindSourceSelect() {
    $('#sourceSelect').addEventListener('change', (e) => {
      state.sourceOnly = e.target.value;
      state.classId = '';
      loadSourceCategories();
      loadFeed(true);
    });
  }

  /* ---------- 过滤开关（位于更新源面板） ---------- */
  function bindFilterSwitch() {
    const check = $('#filterCheck');
    if (!check) return;
    check.addEventListener('change', () => {
      state.filterOn = check.checked;
      saveFilter();
      renderFilterSwitch();
      showToast(state.filterOn ? '成人内容过滤已开启（安全模式）' : '成人内容过滤已关闭', state.filterOn ? 'ok' : '');
      loadFeed(true);
    });
  }

  /* ---------- 加载更多 ---------- */
  function bindLoadMore() {
    $('#loadMoreBtn').addEventListener('click', () => loadFeed(false));
  }

  /* =========================================================
   * 更新源面板
   * ========================================================= */
  function renderSourceModal() {
    const body = $('#sourceBody');
    const pool = SOURCES.filter((s) => !s.candidate);
    const candidates = SOURCES.filter((s) => s.candidate);

    let html = '<div class="sec-title">当前源池 <span class="hint">最多同时启用 ' + CONFIG.maxActive + ' 条 · 卡片左上角为来源标识</span></div>';
    html += pool.map((s) => srcRowHtml(s)).join('');

    html += '<div class="sec-title">在线探测候选源 <span class="hint">逐个实测你当前网络的可达性，通了的可「加入源池」</span></div>';
    html += candidates.map((s) => srcRowHtml(s)).join('');
    body.innerHTML = html;
    bindSrcRowEvents();
  }

  function srcRowHtml(s) {
    const enabled = state.enabled.includes(s.id);
    const scan = state.scanResults[s.id];
    let metricsHtml = '<span>未体检</span>';
    if (scan) {
      metricsHtml = scan.ok
        ? '<span class="metric"><span class="state-dot ok"></span>延迟 <b>' + scan.latencyMs + '</b>ms</span>' +
          '<span class="metric">约 <b>' + (scan.count > 0 ? fmtCount(scan.count) : '—') + '</b> 条</span>' +
          '<span class="metric">' + (scan.directOk ? '直链可用' : '直链待测') + '</span>'
        : '<span class="metric"><span class="state-dot bad"></span>' + esc(scan.note || '不可达') + '</span>';
    }
    return '<div class="src-row" data-src="' + s.id + '">' +
      '<span class="name">' + esc(s.name) +
        '<span class="type ' + (s.type === 'api' ? 'api' : '') + '">' + (s.type === 'api' ? 'API 源' : '样片源') + '</span>' +
        (enabled ? '<span class="type" style="background:rgba(74,222,128,.12);color:var(--green)">启用中</span>' : '') +
      '</span>' +
      '<span class="desc">' + esc(s.desc) + '</span>' +
      '<span class="metrics">' + metricsHtml +
        '<label class="switch"><input type="checkbox" data-enable="' + s.id + '"' + (enabled ? ' checked' : '') + '><span class="track"></span></label>' +
      '</span>' +
    '</div>';
  }

  function bindSrcRowEvents() {
    document.querySelectorAll('#sourceBody .src-row').forEach((row) => {
      const sid = row.dataset.src;
      row.addEventListener('click', (e) => {
        if (e.target.closest('.switch')) return; // 由 checkbox 处理
        const cb = row.querySelector('input[data-enable]');
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
      });
      row.querySelector('input[data-enable]').addEventListener('change', (e) => {
        e.stopPropagation();
        toggleSource(sid, e.target.checked);
      });
    });
  }

  function toggleSource(sid, on) {
    const def = SOURCES.find((s) => s.id === sid);
    if (!def) return;
    if (on) {
      if (state.enabled.includes(sid)) return;
      if (state.enabled.length >= CONFIG.maxActive) {
        showToast('最多同时启用 ' + CONFIG.maxActive + ' 条源，请先停用一个', 'err');
        renderSourceModal();
        return;
      }
      state.enabled.push(sid);
    } else {
      state.enabled = state.enabled.filter((id) => id !== sid);
    }
    saveEnabled();
    renderSourceModal();
    loadSourceCategories();
  }

  /* 扫描体检 */
  async function scanAll() {
    const body = $('#sourceBody');
    const btn = $('#scanAllBtn');
    btn.disabled = true;
    btn.textContent = '体检中…';
    const order = SOURCES.slice();
    for (const s of order) {
      const row = body.querySelector('.src-row[data-src="' + s.id + '"] .metrics');
      if (row) row.innerHTML = '<span class="metric"><span class="state-dot scan"></span>正在体检…</span>';
      const adapter = ADAPTERS[s.id];
      const result = adapter
        ? await adapter.test().catch(() => ({ ok: false, latencyMs: -1, count: 0, directOk: false, note: '体检失败' }))
        : { ok: false, latencyMs: -1, count: 0, directOk: false, note: '无适配器' };
      state.scanResults[s.id] = result;
      saveScanResults();
      // 更新该行
      const rowEl = body.querySelector('.src-row[data-src="' + s.id + '"]');
      if (rowEl) {
        rowEl.outerHTML = srcRowHtml(SOURCES.find((x) => x.id === s.id));
      }
    }
    bindSrcRowEvents();
    btn.disabled = false;
    btn.textContent = '扫描体检全部源';
    showToast('体检完成：可用源已按结果排序，可「一键用最优组合」', 'ok');
    // 自动勾选最优组合（仅提示，不强制）
    const best = bestCombo();
    if (best.length) showToast('推荐组合：' + best.map((id) => SOURCES.find((s) => s.id === id).name).join(' / '), 'ok');
  }

  function bestCombo() {
    return SOURCES
      .filter((s) => state.scanResults[s.id]?.ok)
      .sort((a, b) => {
        const ra = state.scanResults[a.id];
        const rb = state.scanResults[b.id];
        const score = (r) => (r.directOk ? 0 : 1000) + r.latencyMs + (r.count > 0 ? 0 : 2000);
        return score(ra) - score(rb);
      })
      .slice(0, CONFIG.maxActive)
      .map((s) => s.id);
  }

  /* 一键最优组合 */
  function applyBest() {
    const best = bestCombo();
    if (!best.length) {
      showToast('当前没有可用源，请先「扫描体检全部源」', 'err');
      return;
    }
    state.enabled = best;
    saveEnabled();
    renderSourceModal();
    showToast('已切换到体检最优组合：' + best.map((id) => SOURCES.find((s) => s.id === id).name).join(' / '), 'ok');
  }

  /* 应用并刷新 */
  function applySources() {
    if (!state.enabled.length) {
      showToast('至少启用一条源', 'err');
      return;
    }
    $('#sourceModal').classList.remove('open');
    renderSourceSelect();
    loadSourceCategories();
    loadFeed(true);
    showToast('已应用源配置，内容已刷新', 'ok');
  }

  function bindSourceModal() {
    $('#openSourcesBtn').addEventListener('click', () => {
      renderSourceModal();
      renderFilterSwitch();
      $('#sourceModal').classList.add('open');
    });
    $('#closeSourcesBtn').addEventListener('click', () => $('#sourceModal').classList.remove('open'));
    $('#sourceModal').addEventListener('click', (e) => { if (e.target === $('#sourceModal')) $('#sourceModal').classList.remove('open'); });
    $('#scanAllBtn').addEventListener('click', scanAll);
    $('#bestComboBtn').addEventListener('click', applyBest);
    $('#applySourcesBtn').addEventListener('click', applySources);
    $('#loadCustomConfigBtn').addEventListener('click', async () => {
      const url = $('#customConfigUrl').value.trim();
      if (!url) { showToast('先粘贴配置地址', 'err'); return; }
      const btn = $('#loadCustomConfigBtn');
      btn.disabled = true; btn.textContent = '加载中…';
      try {
        const n = await window.__LUNA_RELOAD__(url);
        showToast('已更新：注册 ' + n + ' 个采集站');
        renderSourceModal();
        renderChips();
        renderSourceSelect();
      } catch (e) {
        showToast('配置加载失败：' + (e && e.message ? e.message : '网络错误'), 'err');
      } finally {
        btn.disabled = false; btn.textContent = '加载并更新源';
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#sourceModal').classList.remove('open'); });

    // 自定义配置源更新完成后：清理失效源的状态（启用列表/聚焦/分页/体检缓存）并重渲染
    window.__LUNA_RELOADED__ = function () {
      state.enabled = state.enabled.filter((id) => SOURCES.some((s) => s.id === id));
      if (state.sourceOnly && !SOURCES.some((s) => s.id === state.sourceOnly)) state.sourceOnly = '';
      state.classId = '';
      state.classIsTop = false;
      state.className = '';
      state.pages = {};
      state.scanResults = {};
      state.items = [];
      state.seenKeys.clear();
      saveEnabled();
      renderSourceModal();
      renderChips();
      renderSourceSelect();
      loadSourceCategories();
      loadFeed(true);
    };
    $('#exportBtn').addEventListener('click', exportData);
    $('#importBtn').addEventListener('click', () => importData($('#importBox').value.trim()));
    $('#importFileBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { importData(String(rd.result || '')); e.target.value = ''; };
      rd.onerror = () => { showToast('文件读取失败', 'err'); e.target.value = ''; };
      rd.readAsText(f);
    });
  }

  /* ---------- 数据备份 / 恢复 ---------- */
  function exportData() {
    let favs = {};
    try { favs = JSON.parse(localStorage.getItem(FAV_KEY) || '{}'); } catch (e) { /* ignore */ }
    let configUrl = '';
    try { configUrl = localStorage.getItem('tideflow_config_url_v1') || ''; } catch (e) { /* ignore */ }
    const data = {
      app: 'tideflow',
      version: CONFIG.version,
      exportedAt: new Date().toISOString(),
      history: loadHistory(),
      favs: favs,
      sources: state.enabled,
      filterOn: state.filterOn,
      configUrl: configUrl,
    };
    const json = JSON.stringify(data, null, 2);
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '潮汐TIDEFLOW-备份-v' + CONFIG.version + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      showToast('备份文件已开始下载（历史 ' + data.history.length + ' · 收藏 ' + Object.keys(favs).length + ' · 源 ' + data.sources.length + '）', 'ok');
    } catch (e) {
      showToast('导出失败：' + e.message, 'err');
    }
  }
  function importData(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { showToast('导入失败：不是有效的 JSON', 'err'); return; }
    if (!d || typeof d !== 'object' || !Array.isArray(d.history) || typeof d.favs !== 'object') {
      showToast('导入失败：不是潮汐备份文件（缺少 history/favs 字段）', 'err');
      return;
    }
    try {
      localStorage.setItem(HIST_KEY, JSON.stringify(d.history.slice(0, 40)));
      const favs = {};
      Object.keys(d.favs).forEach((k) => { if (d.favs[k] && d.favs[k].key) favs[k] = d.favs[k]; });
      const fkeys = Object.keys(favs);
      if (fkeys.length > 50) fkeys.slice(0, fkeys.length - 50).forEach((k) => delete favs[k]);
      localStorage.setItem(FAV_KEY, JSON.stringify(favs));
      if (Array.isArray(d.sources)) {
        const valid = d.sources.filter((id) => SOURCES.some((s) => s.id === id));
        if (valid.length) { state.enabled = valid.slice(0, CONFIG.maxActive); saveEnabled(); }
      }
      if (typeof d.filterOn === 'boolean') { state.filterOn = d.filterOn; saveFilter(); }
      if (d.configUrl) { try { localStorage.setItem('tideflow_config_url_v1', d.configUrl); } catch (e) { /* ignore */ } }
      showToast('备份已导入，正在刷新…', 'ok');
      setTimeout(() => location.reload(), 900);
    } catch (e) { showToast('导入失败：' + e.message, 'err'); }
  }

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escAttr(s) { return esc(s); }
  function fmtCount(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' 万';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 万';
    return String(n);
  }

  /* ---------- 初始化 ---------- */
  async function init() {
    /* 版本提示：本地记录版本与当前不一致时，显示更新提示条（不自动跳转，避免平台剥 query 造成循环） */
    try {
      const savedVer = localStorage.getItem('tideflow_ver_v1');
      if (savedVer && savedVer !== CONFIG.version) {
        showVersionBanner(savedVer, CONFIG.version);
      } else {
        localStorage.setItem('tideflow_ver_v1', CONFIG.version);
      }
    } catch (e) { /* ignore */ }
    renderChips();
    renderSourceSelect();
    renderFilterSwitch();
    bindSearch();
    bindSourceSelect();
    bindFilterSwitch();
    bindLoadMore();
    bindSourceModal();
    bindViewButtons();

    // 支持 #q= 直达搜索（部署平台会剥掉 ?query，改用 hash）
    let q = new URLSearchParams(location.search).get('q');
    if (!q && location.hash) {
      q = new URLSearchParams(location.hash.slice(1)).get('q');
    }
    if (q) {
      state.query = q;
      $('#searchInput').value = q;
    }
    // 等待 LunaTV 子站注册完成，再首次加载
    if (window.__LUNA_READY__) {
      showToast('正在探测 LunaTV 自动更新源…');
      await window.__LUNA_READY__;
      // 恢复用户上次启用的源：以保存列表为准，不在的不补，避免 NASA 抢占自选源位置
      try {
        const saved = JSON.parse(localStorage.getItem(CONFIG.storeKey) || '[]');
        if (saved && saved.length) {
          const valid = saved.filter((id) => SOURCES.some((s) => s.id === id));
          if (valid.length) state.enabled = valid.slice(0, CONFIG.maxActive);
        }
      } catch (e) { /* ignore */ }
      // 新用户/从未配过才自动补最快的两个 luna
      if (!state.enabled.some((id) => id.indexOf('luna:') === 0)) {
        const fast = (window.__LUNA_FAST__ || []).slice(0, 2);
        state.enabled = [...state.enabled, ...fast].slice(0, CONFIG.maxActive);
      }
      saveEnabled();
      restoreScanResults();
      renderChips();
      renderCatChips();
      renderSourceSelect();
      loadSourceCategories();
    }
    renderCatChips();
    loadFeed(true);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
