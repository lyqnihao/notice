/* =========================================================
 * 潮汐 TIDEFLOW · 播放页逻辑
 * 直链解析 / m3u8 广告过滤 / 影片资料 / 标签搜索
 * ========================================================= */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  let video = $('#video');
  const videoLoading = $('#videoLoading');
  const videoLoadingText = $('#videoLoadingText');

  /* 播放页标题（tab）：片名 + 集数 + 线路名，不用站名 */
  function updateTitle() {
    const eps = (streams[curStream] && streams[curStream].episodes) || [];
    let t = item && item.title ? '《' + item.title + '》' : '正在播放';
    if (eps.length > 1) t += ' 第 ' + (curEp + 1) + ' 集';
    if (streams[curStream] && streams[curStream].name) t += ' · ' + streams[curStream].name;
    document.title = t;
  }

  let item = null;
  let resolvedUrl = '';        // 当前直链
  let mediaUrl = '';           // 实际播放的子播放列表地址（复制/外部播放用）
  let hls = null;
  let adFilterOn = true;
  let playlistText = '';       // 原始 m3u8 文本（广告过滤用）

  /* 自动连播 + 跨集预热 */
  let autoNext = true;
  let nextWarm = null;         // { ep, url, label } 预热好的下一集（blob 已清洗）
  let warmToken = 0;           // 预热令牌：切集/换线路时失效旧预热
  let preVideo = null;         // 隐藏预载 video（真预缓存下一集媒体）
  let preHls = null;           // 预载 hls 实例（切换时无缝接续）
  function loadAutoNext() {
    try { autoNext = localStorage.getItem('tideflow_autonext_v1') !== '0'; } catch (e) { /* ignore */ }
  }

  /* 续播参数：hash 优先（部署平台会剥 query，hash 完整保留），兼容 search 双通道 */
  let resumeSt = -1;
  let resumeEp = -1;
  let resumeT = 0;
  let curEp = 0;               // 当前选中的集索引（当前线路内）
  let lastSaveAt = 0;
  function readParams() {
    const p = new URLSearchParams();
    try {
      const s = new URLSearchParams(location.search);
      s.forEach((v, k) => p.set(k, v));
      if (location.hash && location.hash.length > 1) {
        try {
          const h = new URLSearchParams(location.hash.slice(1));
          h.forEach((v, k) => p.set(k, v)); // hash 覆盖 search
        } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
    if (p.has('st')) resumeSt = parseInt(p.get('st'), 10);
    if (p.has('ep')) resumeEp = parseInt(p.get('ep'), 10);
    if (p.has('t')) resumeT = parseFloat(p.get('t'));
  }

  /* ---------- 读取当前条目 ---------- */
  function loadItem() {
    try {
      const raw = localStorage.getItem(CONFIG.currentKey);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
  }

  /* 跨设备分享兜底：从 hash 参数解码「播放页 + 直链」自包含条目。
     u = 当前集最终直链（本设备已验证可播，非 blob）；a = 全部集地址（可选，短才带）；
     n / src = 标题与来源。陌生人首次打开也能直接播放，不依赖任何本地缓存。 */
  function loadItemFromHash() {
    try {
      const h = new URLSearchParams(location.hash.slice(1));
      const u = h.get('u');
      if (!u) return null;
      const n = h.get('n') || '未命名';
      const src = h.get('src') || '';
      let streams = null;
      const a = h.get('a');
      if (a) {
        const all = JSON.parse(a); // [{name, episodes:[url,...]}]
        if (Array.isArray(all) && all.length) {
          streams = all.map((s) => ({
            name: s.name || '',
            episodes: (s.episodes || []).map((url, i) => ({ label: '第' + (i + 1) + '集', url: String(url) })),
          }));
        }
      }
      if (!streams) {
        streams = [{ name: src || '分享', episodes: [{ label: '播放', url: u }] }];
      }
      return {
        key: 'shared', id: 'shared', title: n, source: src, sourceId: '',
        streams, episodes: streams[0].episodes, direct: u,
      };
    } catch (e) { return null; }
  }

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function showLoading(text) {
    videoLoading.style.display = 'flex';
    videoLoadingText.textContent = text || '正在解析直链…';
  }
  function hideLoading() {
    videoLoading.style.display = 'none';
  }

  /* ---------- 渲染资料 ---------- */
  function renderInfo() {
    $('#vTitle').textContent = item.title || '未命名';
    const parts = [esc(item.source || '')];
    if (item.date) parts.push(esc(item.date));
    if (item.duration) parts.push(fmtDur(item.duration));
    $('#vSub').innerHTML = parts.filter(Boolean).join(' · ') || '&nbsp;';

    const rows = [];
    rows.push(['编号', item.id || item.key || '—']);
    rows.push(['制片方', item.studio || '—']);
    rows.push(['系列', item.series || '—']);
    rows.push(['主创 / 演员', (item.actors && item.actors.length ? item.actors.join('、') : '—')]);
    rows.push(['年份', item.date ? item.date.slice(0, 4) : '—']);
    rows.push(['地区', item.location || (item.sourceId === 'nasa' ? '美国 · NASA' : '—')]);
    rows.push(['语言', '—']);
    rows.push(['时长', item.duration ? fmtDur(item.duration) : '—']);
    rows.push(['清晰度', item.width ? item.width + '×' + item.height : '—']);
    rows.push(['来源', item.source || '—']);

    $('#metaList').innerHTML = rows
      .map(([k, v]) => '<div class="k">' + k + '</div><div class="v">' + esc(v) + '</div>')
      .join('');

    const tags = [];
    // 标题也作为首个标签（点击搜索片名）
    if (item.title) tags.push([item.title, false, true]);
    (item.tags || []).forEach((t) => tags.push([t, false]));
    (item.categories || []).forEach((c) => tags.push([c, false]));
    (item.actors || []).forEach((a) => tags.push([a, true]));
    const uniq = [];
    const seen = new Set();
    for (const [t, isActor, isTitle] of tags) {
      if (!t || seen.has(t)) continue;
      seen.add(t);
      uniq.push([t, isActor, isTitle]);
    }
    $('#tagList').innerHTML = uniq.slice(0, 24).map(([t, isActor, isTitle]) =>
      '<span class="tag-chip' + (isActor ? ' actor' : '') + (isTitle ? ' title-tag' : '') + '" data-q="' + esc(t) + '" title="' + esc(t) + '">' + esc(t) + '</span>'
    ).join('');
    $('#tagList').querySelectorAll('.tag-chip').forEach((el) => {
      el.addEventListener('click', () => {
        location.href = 'index.html#q=' + encodeURIComponent(el.dataset.q);
      });
    });
  }

  /* ---------- 线路 / 选集 ---------- */
  let streams = [];
  let curStream = 0;

  function buildStreams() {
    if (Array.isArray(item.streams) && item.streams.length) return item.streams;
    return [{ name: item.source || '默认', url: item.direct, episodes: item.episodes || [] }];
  }

  function renderStreams() {
    streams = buildStreams();
    if (resumeSt >= 0 && resumeSt < streams.length) curStream = resumeSt;
    else curStream = 0;
    const panel = $('#streamPanel');
    if (streams.length < 2) {
      panel.style.display = 'none';
    } else {
      panel.style.display = 'block';
      $('#streamList').innerHTML = streams.map((s, i) =>
        '<button class="ep-chip' + (i === curStream ? ' active' : '') + '" data-i="' + i + '">' + esc(s.name) + '</button>'
      ).join('');
      $('#streamList').querySelectorAll('.ep-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          curStream = +btn.dataset.i;
          curEp = 0;
          epPage = 0;
          $('#streamList').querySelectorAll('.ep-chip').forEach((x) => x.classList.remove('active'));
          btn.classList.add('active');
          loadStream();
        });
      });
    }
    renderEpisodes();
  }

  function loadStream() {
    const st = streams[curStream];
    resolvedUrl = st.url;
    $('#directBox').textContent = resolvedUrl;
    $('#adfNote').textContent = '';
    const eps = (st.episodes) || [];
    if (curEp >= 0 && curEp < eps.length) {
      resolvedUrl = eps[curEp].url;
      $('#directBox').textContent = resolvedUrl;
    }
    nextWarm = null;
    warmToken++;
    warming = false;
    updateTitle();
    play().catch(() => { /* ignore */ });
  }

  /* 统一切集：选集点击与自动连播共用；优先无缝接续预载实例，其次预热 blob */
  function switchToEpisode(i) {
    const eps = (streams[curStream] && streams[curStream].episodes) || [];
    if (i < 0 || i >= eps.length) return;
    saveProgress(); // 切集前保存当前集进度
    curEp = i;
    resumeT = 0;
    resolvedUrl = eps[i].url;
    $('#directBox').textContent = resolvedUrl;
    $('#adfNote').textContent = '';
    // 更新选集高亮
    document.querySelectorAll('#epList .ep-chip').forEach((x, k) => {
      x.classList.toggle('active', epPage * EP_PAGE_SIZE + k === i);
    });
    const w = nextWarm && nextWarm.ep === i ? nextWarm : null;
    nextWarm = null;
    warmToken++;
    warming = false;
    mediaUrl = eps[i].url;
    updateTitle();
    // ① 预载实例有真实缓冲 → 无缝接续（几乎零等待）
    if (swapToPreloaded()) return;
    // ② 预热 blob 缓存 → 本地秒解析，跳过网络拉列表
    if (w && /^blob:/.test(w.url)) {
      startHls(w.url);
      return;
    }
    // ③ 常规播放
    play().catch(() => { /* ignore */ });
  }

  /* 隐藏预载 video：预热下一集时真实拉取并缓冲前几个分段 */
  function warmMedia(blobUrl) {
    killPreVideo();
    preVideo = document.createElement('video');
    preVideo.muted = true;
    preVideo.preload = 'auto';
    // 全尺寸覆盖在主 video 上（透明不可见）：保持真实渲染/解码，避免被浏览器降级节流
    preVideo.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;pointer-events:none;';
    $('#videoBox').appendChild(preVideo);
    if (window.Hls && Hls.isSupported()) {
      preHls = new Hls({
        maxBufferLength: 90, maxMaxBufferLength: 180, backBufferLength: 30, lowLatencyMode: false,
      });
      preHls.loadSource(blobUrl);
      preHls.attachMedia(preVideo);
      preHls.on(Hls.Events.MANIFEST_PARSED, () => { preVideo.play().catch(() => { /* 静音自动播放一般允许 */ }); });
    } else if (preVideo.canPlayType('application/vnd.apple.mpegurl')) {
      preVideo.src = blobUrl;
      preVideo.load();
    }
  }
  function killPreVideo() {
    if (preHls) { try { preHls.destroy(); } catch (e) { /* ignore */ } preHls = null; }
    if (preVideo) { try { preVideo.remove(); } catch (e) { /* ignore */ } preVideo = null; }
  }

  /* 无缝接续：把预载 video 提升为主播放，保留已缓冲数据继续播 */
  function swapToPreloaded() {
    const pv = preVideo;
    if (!pv) return false;
    // 只要有已缓冲数据即无缝接续（readyState>=1 或已缓冲），尽量利用预热成果
    const hasData = pv.readyState >= 1 || (pv.buffered && pv.buffered.length > 0);
    if (!hasData) { killPreVideo(); return false; }
    const ph = preHls;
    stopHls();
    pv.muted = false;
    pv.controls = true;
    pv.style.cssText = '';
    pv.id = 'video';
    video.replaceWith(pv);
    video = pv;
    preVideo = null;
    preHls = null;
    hls = ph; // 主 hls 指向预载实例，继续拉后续分段
    bindVideoEvents(); // 重绑进度/保存/连播/预热监听
    if (hls && hls.startLoad) { try { hls.startLoad(); } catch (e) { /* ignore */ } }
    video.play().catch(() => {
      showLoading('点击播放继续'); setTimeout(hideLoading, 1400);
    });
    return true;
  }

  /* 预热下一集：后台解析直链 → 子列表 → 广告清洗 → blob 缓存，播完切过去秒开 */
  let warming = false;
  function warmNextEpisode() {
    const eps = (streams[curStream] && streams[curStream].episodes) || [];
    const ni = curEp + 1;
    if (ni >= eps.length) return;
    if (nextWarm && nextWarm.ep === ni) return;
    if (warming) return; // 已在预热中
    const url = eps[ni].url;
    const my = warmToken;
    if (!/\.m3u8($|\?)/i.test(url)) { nextWarm = { ep: ni, url: url }; return; }
    warming = true;
    (async () => {
      try {
        let masterText = '';
        try {
          const res = await fetchWithTimeout(url, 10000);
          if (res.ok) masterText = await res.text();
        } catch (e) { /* ignore */ }
        if (!masterText) {
          try {
            const r2 = await fetchWithTimeout(lunaRelay(url), 10000);
            masterText = await r2.text();
          } catch (e) { /* ignore */ }
        }
        if (my !== warmToken) return; // 已切集/换线路，预热作废
        let subUrl = url;
        let subText = '';
        const variant = masterText ? firstVariantUrl(masterText, url) : null;
        if (variant) {
          subUrl = variant;
          try {
            const r3 = await fetchWithTimeout(variant, 10000);
            subText = await r3.text();
          } catch (e) {
            try {
              const r4 = await fetchWithTimeout(lunaRelay(variant), 10000);
              subText = await r4.text();
            } catch (e2) { /* ignore */ }
          }
        }
        if (my !== warmToken) return;
        if (subText) {
          const base = subUrl;
          const filtered = adFilterOn ? stripForeignSegments(subText, base) : subText;
          const absolute = absolutizeSegments(filtered, base);
          const blob = new Blob([absolute], { type: 'application/vnd.apple.mpegurl' });
          const blobUrl = URL.createObjectURL(blob);
          nextWarm = { ep: ni, url: blobUrl, label: eps[ni].label };
          // 真预载：隐藏 video + 独立播放实例拉取并缓冲前几个分段（切换时无缝接续）
          warmMedia(blobUrl);
        } else {
          nextWarm = { ep: ni, url: subUrl, label: eps[ni].label };
        }
        if (my !== warmToken) return;
        $('#adfNote').textContent = '下一集已预热：' + (nextWarm.label || '');
      } catch (e) { /* 预热失败静默：切集时走正常解析 */ }
      finally {
        if (my === warmToken) warming = false;
      }
    })();
  }

  /* ---------- 选集（分页渲染，支持几百集的短剧/长剧） ---------- */
  const EP_PAGE_SIZE = 60;
  let epPage = 0;

  function renderEpisodes() {
    const eps = (streams[curStream] && streams[curStream].episodes) || [];
    const panel = $('#epPanel');
    if (eps.length < 2) { panel.style.display = 'none'; curEp = 0; return; }
    panel.style.display = 'block';
    curEp = (resumeEp >= 0 && resumeEp < eps.length) ? resumeEp : 0;
    const total = eps.length;
    const totalPages = Math.max(1, Math.ceil(total / EP_PAGE_SIZE));
    if (epPage >= totalPages) epPage = totalPages - 1;
    if (epPage < 0) epPage = 0;
    const start = epPage * EP_PAGE_SIZE;
    const page = eps.slice(start, start + EP_PAGE_SIZE);
    const listHtml = page.map((e, k) => {
      const i = start + k;
      return '<button class="ep-chip' + (i === curEp ? ' active' : '') + '" data-i="' + i + '">' + esc(e.label) + '</button>';
    }).join('');
    $('#epList').innerHTML = listHtml;
    // 分页信息与控件
    const pager = $('#epPager');
    if (totalPages > 1) {
      pager.style.display = 'flex';
      $('#epPageTxt').textContent = '第 ' + (epPage + 1) + '/' + totalPages + ' 页 · 共 ' + total + ' 集';
      $('#epPrev').disabled = epPage === 0;
      $('#epNext').disabled = epPage >= totalPages - 1;
    } else {
      pager.style.display = 'none';
    }
    $('#epList').querySelectorAll('.ep-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchToEpisode(epPage * EP_PAGE_SIZE + +btn.dataset.i);
      });
    });
  }

  function bindEpPager() {
    const prev = $('#epPrev');
    const next = $('#epNext');
    if (!prev || !next) return;
    prev.addEventListener('click', () => {
      if (epPage > 0) { epPage--; renderEpisodes(); }
    });
    next.addEventListener('click', () => {
      epPage++; renderEpisodes();
    });
  }

  /* ---------- 解析直链 ---------- */
  async function resolveDirect() {
    if (item.needResolve && item.assetRef) {
      // NASA 类：资产清单 + 启发式直连候选双通道解析
      showLoading('正在解析 NASA 直链…');
      try {
        const r = await resolveNasaAsset(item.assetRef, item.id);
        if (!r.mp4) throw new Error('未找到可播放文件');
        resolvedUrl = r.mp4;
        $('#directBox').textContent = resolvedUrl;
        $('#adfRow').style.display = 'none';
        $('#adfNote').textContent = r.via === 'heuristic' ? '已通过直连候选解析（无需资产接口）' : 'MP4 直链，无需流级广告过滤';
        return;
      } catch (e) {
        showLoading('直链解析失败：' + (e && e.message ? e.message : '网络错误'));
        $('#directBox').textContent = '解析失败 —— 可点击「重试」或「外部播放器」';
        setTimeout(hideLoading, 1500);
        throw e;
      }
    }
    if (item.direct) {
      resolvedUrl = item.direct;
      $('#directBox').textContent = resolvedUrl;
      if (/\.m3u8($|\?)/i.test(resolvedUrl)) {
        // 流媒体：广告过滤面板可用
        $('#adfRow').style.display = 'flex';
        $('#adfNote').textContent = '';
      } else {
        $('#adfRow').style.display = 'none';
        $('#adfNote').textContent = 'MP4 / WebM 直链，无需流级广告过滤';
      }
      return;
    }
    throw new Error('该条目没有可解析的直链');
  }

  /* ---------- 播放 ---------- */
  async function play() {
    stopHls();
    // 常规播放路径：销毁预载实例并复位预热状态（切集/重试/换线路时旧预热作废）
    killPreVideo();
    warming = false;
    if (/\.m3u8($|\?)/i.test(resolvedUrl)) {
      await playHls(resolvedUrl);
      return;
    }
    video.src = resolvedUrl;
    video.play().catch(() => { /* 浏览器自动播放限制由用户点击触发 */ });
  }

  function stopHls() {
    if (hls) { try { hls.destroy(); } catch (e) { /* ignore */ } hls = null; }
  }

  /* ---------- m3u8 + 广告过滤 ---------- */
  async function playHls(url) {
    showLoading('正在加载流媒体…');
    let masterText = '';
    try {
      const res = await fetchWithTimeout(url, 15000);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      masterText = await res.text();
    } catch (e) {
      try {
        const r2 = await fetchWithTimeout(lunaRelay(url), 15000);
        masterText = await r2.text();
      } catch (e2) {
        playlistText = '';
        startHls(url);
        return;
      }
    }
    // 主播放列表（多码率变体）：跟随到第一个码率的子播放列表再过滤
    const variant = firstVariantUrl(masterText, url);
    if (variant) {
      let subText = '';
      try {
        const r3 = await fetchWithTimeout(variant, 15000);
        subText = await r3.text();
      } catch (e) {
        try {
          const r4 = await fetchWithTimeout(lunaRelay(variant), 15000);
          subText = await r4.text();
        } catch (e2) { /* 抓不到子列表就播主列表 */ }
      }
      if (subText) {
        playlistText = subText;
        mediaUrl = variant;
        startHls(applyAdFilter(variant));
        return;
      }
    }
    playlistText = masterText;
    mediaUrl = url;
    startHls(applyAdFilter(url));
  }

  function firstVariantUrl(text, baseUrl) {
    const m = text.match(/^([^#\s][^\n]*\.m3u8[^\n]*)$/m);
    if (!m) return null;
    try { return new URL(m[1].trim(), baseUrl).href; } catch (e) { return null; }
  }

  function applyAdFilter(mediaUrl) {
    if (!adFilterOn || !playlistText) return resolvedUrl;
    const base = mediaUrl || resolvedUrl;
    const filtered = stripForeignSegments(playlistText, base);
    if (filtered === playlistText) {
      $('#adfNote').textContent = '未检测到异目录广告分段';
      return base;
    }
    const removed = countRemovedSegments(playlistText, filtered);
    // 把相对分段地址重写成绝对地址，blob 才能加载
    const absolute = absolutizeSegments(filtered, base);
    $('#adfNote').textContent = '已剔除 ' + removed + ' 段广告分段，直接进入正片';
    const blob = new Blob([absolute], { type: 'application/vnd.apple.mpegurl' });
    return URL.createObjectURL(blob);
  }

  /* 剔除不属于主播放列表目录的分段（广告位）——实现位于 sources.js */
  function startHls(url) {
    stopHls();
    if (window.Hls && Hls.isSupported()) {
      // 预缓存增强：加大前向/后向缓存（90s 水位，播放临近结尾仍持续拉取），点播流畅度优先
      hls = new Hls({
        maxBufferLength: 90,
        maxMaxBufferLength: 180,
        backBufferLength: 90,
        lowLatencyMode: false,
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        hideLoading();
        seekResume();
        video.play().catch(() => { /* ignore */ });
      });
      hls.on(Hls.Events.ERROR, (e, data) => {
        if (data && data.fatal) {
          showLoading('播放出错：' + (data.details || '未知错误'));
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.addEventListener('loadedmetadata', () => { hideLoading(); seekResume(); }, { once: true });
      video.play().catch(() => { /* ignore */ });
    } else {
      showLoading('当前浏览器不支持 HLS 播放');
    }
  }

  /* 续播跳转 + 播放进度保存 */
  function seekResume() {
    if (resumeT > 5 && isFinite(video.duration) && video.duration > resumeT + 5) {
      try { video.currentTime = resumeT; } catch (e) { /* ignore */ }
      resumeT = 0; // 只跳一次
    }
  }
  function saveProgress() {
    const t = video.currentTime;
    const d = video.duration;
    if (!isFinite(t) || !isFinite(d) || d <= 0 || t < 3) return;
    try {
      const arr = JSON.parse(localStorage.getItem('tideflow_history_v1') || '[]');
      // 历史/收藏只保留前 500 集，避免几千集短剧把 localStorage 撑爆
      const snap = Object.assign({}, item, { episodes: (item.episodes || []).slice(0, EP_LIMIT), st: curStream, ep: curEp, time: t, duration: d });
      const idx = arr.findIndex((x) => x.key === item.key);
      if (idx > -1) arr.splice(idx, 1);
      arr.unshift(snap);
      localStorage.setItem('tideflow_history_v1', JSON.stringify(arr.slice(0, HIST_LIMIT)));
      // 已收藏的条目同步进度
      const fo = JSON.parse(localStorage.getItem('tideflow_favs_v1') || '{}');
      if (fo[item.key]) {
        fo[item.key] = Object.assign({}, fo[item.key], { episodes: (item.episodes || []).slice(0, EP_LIMIT), st: curStream, ep: curEp, time: t, duration: d });
        localStorage.setItem('tideflow_favs_v1', JSON.stringify(fo));
      }
    } catch (e) { /* ignore */ }
  }
  /* 秒 → h:mm:ss / mm:ss */
  function fmtClock(s) {
    if (!isFinite(s) || s < 0) s = 0;
    const sec = Math.floor(s % 60);
    const min = Math.floor(s / 60) % 60;
    const hr = Math.floor(s / 3600);
    const p = (n) => String(n).padStart(2, '0');
    return hr > 0 ? hr + ':' + p(min) + ':' + p(sec) : p(min) + ':' + p(sec);
  }

  /* 绑定当前 video 的全部播放相关事件（初绑与无缝交换后重绑共用） */
  function bindVideoEvents() {
    const progRow = $('#progRow');
    const progBar = $('#progBar');
    const progCur = $('#progCur');
    const progDur = $('#progDur');
    let progDragging = false;
    function showProg() { if (progRow) progRow.style.display = 'flex'; }
    function upd() {
      const d = video.duration;
      const t = video.currentTime;
      if (!isFinite(d) || d <= 0) return;
      showProg(); // 有时长即显示（HLS 下 loadedmetadata 可能不触发，兜底）
      progBar.max = 1000;
      if (!progDragging) progBar.value = Math.round(t / d * 1000); // 拖动中不覆盖用户位置
      progCur.textContent = fmtClock(t);
      progDur.textContent = fmtClock(d);
    }
    video.addEventListener('playing', () => { hideLoading(); showProg(); });
    video.addEventListener('loadedmetadata', () => {
      seekResume();
      showProg();
    });
    video.addEventListener('durationchange', showProg);
    video.addEventListener('canplay', showProg);
    video.addEventListener('error', () => {
      if (!videoLoading.style.display || videoLoading.style.display === 'none') {
        showLoading('视频加载失败 —— 可点「重试」或换「外部播放器」');
        setTimeout(hideLoading, 2500);
      }
    });
    // 自动连播：播完自动接下一集
    video.addEventListener('ended', () => {
      if (!autoNext) return;
      const eps = (streams[curStream] && streams[curStream].episodes) || [];
      const ni = curEp + 1;
      if (ni < eps.length) switchToEpisode(ni);
    });
    // 距结尾 120 秒内预热下一集（真预载媒体，切换无缝；120s 提前量覆盖慢网络）
    let warmedAt = 0;
    video.addEventListener('timeupdate', () => {
      if (!autoNext || nextWarm) return;
      const d = video.duration;
      const t = video.currentTime;
      if (!isFinite(d) || d <= 0) return;
      const now = Date.now();
      if (d - t < 120 && now - warmedAt > 10000) { warmedAt = now; warmNextEpisode(); }
    });
    // 进度保存（每 5 秒）+ 常驻进度条刷新
    video.addEventListener('timeupdate', () => {
      const now = Date.now();
      if (now - lastSaveAt > 5000) { lastSaveAt = now; saveProgress(); }
      if (!progDragging && progBar) upd();
    });
    // 常驻进度条拖动
    if (progBar) {
      progBar.addEventListener('input', () => {
        progDragging = true;
        // 跟随拖动位置显示，不被播放进度抢回
        if (isFinite(video.duration) && video.duration > 0) {
          progCur.textContent = fmtClock((progBar.value / 1000) * video.duration);
        }
      });
      progBar.addEventListener('change', () => {
        progDragging = false;
        if (isFinite(video.duration) && video.duration > 0) {
          video.currentTime = (progBar.value / 1000) * video.duration;
        }
      });
    }
  }
  function bindProgress() {
    window.addEventListener('beforeunload', saveProgress);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });
  }

  /* ---------- 重试 / 外部播放 ---------- */
  function bindTools() {
    // 快进 / 快退：10秒 / 1分钟 / 10分钟
    const seekRow = $('#seekRow');
    if (seekRow) {
      seekRow.querySelectorAll('.seek-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const d = Number(btn.dataset.d) || 0;
          if (!video || !isFinite(video.duration) || video.duration <= 0) {
            showLoading('视频尚未就绪，无法定位');
            setTimeout(hideLoading, 1200);
            return;
          }
          const nt = Math.min(Math.max(video.currentTime + d, 0), video.duration);
          const wasPlaying = !video.paused && !video.ended;
          video.currentTime = nt;
          if (wasPlaying) {
            // hls 重载会中止 play()：先即时恢复，被中止则稍后重试一次
            const tryPlay = () => video.play().catch(() => setTimeout(() => video.play().catch(() => { /* ignore */ }), 400));
            tryPlay();
          }
          // 原暂停状态下定位：保持暂停，不打断用户操作
        });
      });
    }
    $('#retryBtn').addEventListener('click', async () => {
      $('#adfNote').textContent = '';
      try {
        await resolveDirect();
        await play();
        hideLoading();
      } catch (e) {
        showLoading('重试失败：' + (e && e.message ? e.message : '网络错误'));
        setTimeout(hideLoading, 1800);
      }
    });
    $('#externalBtn').addEventListener('click', () => {
      if (mediaUrl || resolvedUrl) window.open(mediaUrl || resolvedUrl, '_blank');
      else showLoading('直链尚未解析完成');
    });
    $('#shareBtn').addEventListener('click', async () => {
      // 「播放页 + 直链」自包含分享（恢复 v1.3.30）：带当前集最终直链 + 可选全部集地址（足够短才带，对方可切集）
      // 不用 blob（跨设备失效）、不带超长剧集 JSON（防平台/服务器截断）
      let urlToCopy = '';
      try {
        const u = String(mediaUrl || resolvedUrl || '').replace(/^blob:/, '');
        if (!/^https?:\/\//i.test(u)) { showLoading('直链尚未解析完成'); setTimeout(hideLoading, 1200); return; }
        const parts = ['v=' + CONFIG.version, 'st=' + curStream, 'ep=' + curEp];
        const t = (isFinite(video.duration) && video.duration > 0) ? Math.floor(video.currentTime) : 0;
        if (t > 0) parts.push('t=' + t);
        parts.push('u=' + encodeURIComponent(u));
        parts.push('n=' + encodeURIComponent(item.title || ''));
        if (item.source) parts.push('src=' + encodeURIComponent(item.source));
        // 可选：全部集地址（足够短才带，对方可切集）
        try {
          const all = JSON.stringify(streams.map((s) => ({ name: s.name || '', episodes: (s.episodes || []).map((e) => e.url) })));
          const ae = encodeURIComponent(all);
          if (ae.length <= 6000) parts.push('a=' + ae);
        } catch (e) { /* ignore */ }
        urlToCopy = location.origin + location.pathname + '#' + parts.join('&');
      } catch (e) { /* ignore */ }
      if (!urlToCopy) {
        showLoading('当前直链不可用，无法生成分享链接');
        setTimeout(hideLoading, 1800);
        return;
      }
      const done = () => {
        $('#shareBtn').textContent = '已复制 ✓';
        setTimeout(() => { $('#shareBtn').textContent = '分享播放页'; }, 1600);
      };
      const legacyCopy = () => {
        try {
          const ta = document.createElement('textarea');
          ta.value = urlToCopy;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        } catch (e) { /* ignore */ }
      };
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await Promise.race([
            navigator.clipboard.writeText(urlToCopy),
            new Promise((r) => setTimeout(() => r('timeout'), 800)),
          ]);
        } else {
          legacyCopy();
        }
        done();
      } catch (e) {
        legacyCopy();
        done();
      }
    });
    $('#copyBtn').addEventListener('click', async () => {
      const urlToCopy = mediaUrl || resolvedUrl;
      if (!urlToCopy) { showLoading('直链尚未解析完成'); return; }
      const done = () => {
        $('#copyBtn').textContent = '已复制 ✓';
        setTimeout(() => { $('#copyBtn').textContent = '复制直链'; }, 1600);
      };
      const legacyCopy = () => {
        try {
          const ta = document.createElement('textarea');
          ta.value = mediaUrl || resolvedUrl;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        } catch (e) { /* ignore */ }
      };
      try {
        if (navigator.clipboard && window.isSecureContext) {
          // 无焦点/无头环境下 clipboard Promise 可能永不返回，做超时竞速
          await Promise.race([
            navigator.clipboard.writeText(urlToCopy),
            new Promise((r) => setTimeout(() => r('timeout'), 800)),
          ]);
        } else {
          legacyCopy();
        }
        done();
      } catch (e) {
        legacyCopy();
        done();
      }
    });
    // 下载剔除广告后的 m3u8 文件，丢进 VLC/PotPlayer 可直接播
    $('#downloadM3u8Btn').addEventListener('click', () => {
      if (!playlistText || !mediaUrl) { showLoading('播放列表尚未解析完成'); return; }
      const filtered = adFilterOn ? stripForeignSegments(playlistText, mediaUrl) : playlistText;
      const body = absolutizeSegments(filtered === playlistText ? playlistText : filtered, mediaUrl);
      const blob = new Blob([body], { type: 'application/vnd.apple.mpegurl' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (item.title || 'video').replace(/[\\/:*?"<>|]/g, '_') + '.m3u8';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    $('#adfCheck').addEventListener('change', (e) => {
      adFilterOn = e.target.checked;
      $('#adfNote').textContent = '';
      if (/\.m3u8($|\?)/i.test(resolvedUrl)) {
        if (adFilterOn) $('#adfNote').textContent = '广告过滤已开启';
        playHls(resolvedUrl).catch(() => { /* ignore */ });
      }
    });
    // 隐藏的 checkbox 点不到，让开关轨道整段可点
    document.querySelector('#adfRow .track').addEventListener('click', (e) => {
      e.preventDefault();
      $('#adfCheck').click();
    });
    // 自动连播开关（记忆偏好）
    $('#autoNextCheck').checked = autoNext;
    $('#autoNextCheck').addEventListener('change', (e) => {
      autoNext = e.target.checked;
      try { localStorage.setItem('tideflow_autonext_v1', autoNext ? '1' : '0'); } catch (err) { /* ignore */ }
      if (!autoNext) { nextWarm = null; warmToken++; }
    });
    const anTrack = document.querySelector('#autoNextRow .track');
    if (anTrack) {
      anTrack.addEventListener('click', (e) => {
        e.preventDefault();
        $('#autoNextCheck').click();
      });
    }
  }

  /* ---------- 收藏 ---------- */
  const FAV_KEY = 'tideflow_favs_v1';
  function isFav(key) {
    try { return !!JSON.parse(localStorage.getItem(FAV_KEY) || '{}')[key]; } catch (e) { return false; }
  }
  function renderFavBtn() {
    const b = $('#favBtn');
    b.classList.toggle('on', item && isFav(item.key));
  }
  function bindFavBtn() {
    $('#favBtn').addEventListener('click', () => {
      if (!item) return;
      try {
        const o = JSON.parse(localStorage.getItem(FAV_KEY) || '{}');
        if (o[item.key]) {
          delete o[item.key];
          localStorage.setItem(FAV_KEY, JSON.stringify(o)); // 关键：删除后写回，否则取消不生效
          renderFavBtn();
          showToastMsg('已取消收藏');
        } else {
          o[item.key] = Object.assign({}, item, { episodes: (item.episodes || []).slice(0, EP_LIMIT) });
          const keys = Object.keys(o);
          if (keys.length > FAV_LIMIT) delete o[keys[0]]; // 超上限移除最早收藏
          localStorage.setItem(FAV_KEY, JSON.stringify(o));
          renderFavBtn();
          showToastMsg('已收藏，首页「收藏」可查看');
        }
      } catch (e) { /* ignore */ }
    });
  }
  let favToastTimer = null;
  function showToastMsg(msg) {
    let el = $('#pToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pToast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(favToastTimer);
    favToastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ---------- 初始化 ---------- */
  async function init() {
    loadAutoNext();
    readParams();
    item = loadItem();
    if (!item) item = loadItemFromHash(); // 分享链接自包含兜底（恢复 v1.3.30：本地缓存优先）
    if (!item) {
      $('#vTitle').textContent = '没有可播放的条目';
      $('#directBox').textContent = '请从首页选择一部影片进入播放页';
      $('#videoTools').style.display = 'none';
      $('#favBtn').style.display = 'none';
      hideLoading();
      return;
    }
    renderInfo();
    renderFavBtn();
    bindFavBtn();
    renderStreams();
    bindEpPager();
    bindTools();
    bindVideoEvents();
    bindProgress();
    updateTitle();
    try {
      await resolveDirect();
      await play();
      hideLoading();
    } catch (e) {
      // 已在 resolveDirect 内提示
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
