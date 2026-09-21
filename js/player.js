/* =========================================================
 * 潮汐 TIDEFLOW · 播放页逻辑
 * 直链解析 / m3u8 广告过滤 / 影片资料 / 标签搜索
 * ========================================================= */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const video = $('#video');
  const videoLoading = $('#videoLoading');
  const videoLoadingText = $('#videoLoadingText');

  let item = null;
  let resolvedUrl = '';        // 当前直链
  let mediaUrl = '';           // 实际播放的子播放列表地址（复制/外部播放用）
  let hls = null;
  let adFilterOn = true;
  let playlistText = '';       // 原始 m3u8 文本（广告过滤用）

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
    play().catch(() => { /* ignore */ });
  }

  function renderEpisodes() {
    const eps = (streams[curStream] && streams[curStream].episodes) || [];
    const panel = $('#epPanel');
    if (eps.length < 2) { panel.style.display = 'none'; curEp = 0; return; }
    panel.style.display = 'block';
    curEp = (resumeEp >= 0 && resumeEp < eps.length) ? resumeEp : 0;
    $('#epList').innerHTML = eps.map((e, i) =>
      '<button class="ep-chip' + (i === curEp ? ' active' : '') + '" data-i="' + i + '">' + esc(e.label) + '</button>'
    ).join('');
    $('#epList').querySelectorAll('.ep-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = +btn.dataset.i;
        curEp = i;
        resolvedUrl = eps[i].url;
        $('#directBox').textContent = resolvedUrl;
        $('#epList').querySelectorAll('.ep-chip').forEach((x) => x.classList.remove('active'));
        btn.classList.add('active');
        $('#adfNote').textContent = '';
        play().catch(() => { /* ignore */ });
      });
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
      hls = new Hls({ maxBufferLength: 30 });
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
      const snap = Object.assign({}, item, { st: curStream, ep: curEp, time: t, duration: d });
      const idx = arr.findIndex((x) => x.key === item.key);
      if (idx > -1) arr.splice(idx, 1);
      arr.unshift(snap);
      localStorage.setItem('tideflow_history_v1', JSON.stringify(arr.slice(0, 40)));
      // 已收藏的条目同步进度
      const fo = JSON.parse(localStorage.getItem('tideflow_favs_v1') || '{}');
      if (fo[item.key]) {
        fo[item.key] = Object.assign({}, fo[item.key], { st: curStream, ep: curEp, time: t, duration: d });
        localStorage.setItem('tideflow_favs_v1', JSON.stringify(fo));
      }
    } catch (e) { /* ignore */ }
  }
  function bindProgress() {
    video.addEventListener('timeupdate', () => {
      const now = Date.now();
      if (now - lastSaveAt > 5000) { lastSaveAt = now; saveProgress(); }
    });
    window.addEventListener('beforeunload', saveProgress);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });
  }

  /* ---------- 重试 / 外部播放 ---------- */
  function bindTools() {
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
    video.addEventListener('playing', hideLoading);
    video.addEventListener('loadedmetadata', () => { seekResume(); });
    bindProgress();
    video.addEventListener('error', () => {
      if (!videoLoading.style.display || videoLoading.style.display === 'none') {
        showLoading('视频加载失败 —— 可点「重试」或换「外部播放器」');
        setTimeout(hideLoading, 2500);
      }
    });
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
          o[item.key] = item;
          const keys = Object.keys(o);
          if (keys.length > 50) delete o[keys[0]]; // 上限 50
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
    readParams();
    item = loadItem();
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
    bindTools();
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
