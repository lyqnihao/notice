/**
 * 清影 CleanVid 主逻辑
 */
(function () {
  const C = window.CLEANVID;
  const API = window.CleanAPI;
  const Player = window.CleanPlayer;

  let state = {
    view: 'home', // home | play
    page: 1,
    category: 'all',
    keyword: '',
    items: [],
    loading: false,
    hasMore: true,
    current: null,
    epIndex: 0
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function loadStorage() {
    try {
      const raw = localStorage.getItem(C.STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (Array.isArray(s.active)) C.ACTIVE_SOURCES = s.active;
      }
    } catch {}
  }

  function saveStorage() {
    localStorage.setItem(C.STORAGE_KEY, JSON.stringify({
      active: C.ACTIVE_SOURCES
    }));
  }

  function showHome() {
    state.view = 'home';
    $('#home-view').classList.remove('hidden');
    $('#play-view').classList.add('hidden');
    Player.destroy();
  }

  function showPlay() {
    state.view = 'play';
    $('#home-view').classList.add('hidden');
    $('#play-view').classList.remove('hidden');
  }

  function renderCards(items, append = false) {
    const grid = $('#grid');
    if (!append) grid.innerHTML = '';
    if (!items.length && !append) {
      $('#status').classList.remove('hidden');
      $('#status').innerHTML = '<p>没有找到内容（已过滤成人内容）</p>';
      return;
    }
    $('#status').classList.add('hidden');

    const frag = document.createDocumentFragment();
    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.id = item.id;
      card.dataset.source = item.sourceId;

      const actors = (item.actor || '')
        .split(/[,，/、\s]+/)
        .filter(Boolean)
        .slice(0, 3);

      const tagsHtml = actors.length
        ? actors.map(a => `<span class="tag" data-q="${escapeAttr(a)}">${escapeHtml(a)}</span>`).join('')
        : (item.tags || []).slice(0, 2).map(t => `<span class="tag" data-q="${escapeAttr(t)}">${escapeHtml(t)}</span>`).join('');

      card.innerHTML = `
        <div class="card-cover">
          <img loading="lazy" src="${escapeAttr(item.pic || '')}" alt="" onerror="this.style.opacity=0.2">
          <span class="card-badge">${escapeHtml(item.sourceName)}</span>
          ${item.remarks ? `<span class="card-remarks">${escapeHtml(item.remarks)}</span>` : ''}
        </div>
        <div class="card-body">
          <div class="card-title" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</div>
          <div class="card-tags">${tagsHtml}</div>
        </div>
      `;
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('tag')) {
          e.stopPropagation();
          doSearch(e.target.dataset.q);
          return;
        }
        openPlay(item);
      });
      frag.appendChild(card);
    }
    grid.appendChild(frag);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/\n/g, ' ');
  }

  async function loadList(reset = true) {
    if (state.loading) return;
    state.loading = true;
    if (reset) {
      state.page = 1;
      state.items = [];
      $('#grid').innerHTML = '';
      $('#status').classList.remove('hidden');
      $('#status').innerHTML = '<div class="spinner"></div><p>加载中…</p>';
    }

    try {
      let list;
      if (state.keyword) {
        list = await API.aggregateSearch(state.keyword);
        state.hasMore = false;
      } else {
        list = await API.aggregateList(state.page);
        // 简单分类过滤
        if (state.category !== 'all') {
          const cat = C.CATEGORIES.find(c => c.id === state.category);
          if (cat && cat.keywords) {
            list = list.filter(item => {
              const t = item.type || '';
              return cat.keywords.some(k => t.includes(k));
            });
          }
        }
        state.hasMore = list.length >= 8;
      }
      state.items = reset ? list : state.items.concat(list);
      renderCards(list, !reset);
      $('#load-more').classList.toggle('hidden', !state.hasMore || !!state.keyword);
    } catch (e) {
      console.error(e);
      if (reset) {
        $('#status').innerHTML = `<p>加载失败：${escapeHtml(e.message)}。请检查网络或配置 CORS 代理。</p>`;
      }
    } finally {
      state.loading = false;
    }
  }

  async function openPlay(item) {
    showPlay();
    $('#play-title').textContent = item.name;
    $('#play-meta').innerHTML = '<p>加载详情…</p>';
    $('#ep-list').innerHTML = '';
    $('#direct-url').value = '';
    Player.destroy();

    let detail = item;
    try {
      const full = await API.getDetail(item.sourceId, item.id);
      if (full) detail = full;
    } catch (e) {
      console.warn('detail fail', e);
    }
    state.current = detail;
    state.epIndex = 0;

    renderPlayMeta(detail);
    renderEpisodes(detail);
    if (detail.episodes && detail.episodes[0]) {
      playEpisode(0);
    }
  }

  function renderPlayMeta(item) {
    const actors = (item.actor || '').split(/[,，/、\s]+/).filter(Boolean);
    const tags = item.tags || [];
    const allTags = [...new Set([...actors, ...tags])];

    let html = `
      <div class="meta-grid">
        <div><strong>来源</strong> · ${escapeHtml(item.sourceName)}</div>
        ${item.type ? `<div><strong>分类</strong> · ${escapeHtml(item.type)}</div>` : ''}
        ${item.year ? `<div><strong>年份</strong> · ${escapeHtml(item.year)}</div>` : ''}
        ${item.area ? `<div><strong>地区</strong> · ${escapeHtml(item.area)}</div>` : ''}
        ${item.lang ? `<div><strong>语言</strong> · ${escapeHtml(item.lang)}</div>` : ''}
        ${item.director ? `<div><strong>导演</strong> · ${escapeHtml(item.director)}</div>` : ''}
        ${item.remarks ? `<div><strong>备注</strong> · ${escapeHtml(item.remarks)}</div>` : ''}
      </div>
    `;
    if (allTags.length) {
      html += '<div class="tag-list">' + allTags.map(t =>
        `<span class="tag" data-q="${escapeAttr(t)}">${escapeHtml(t)}</span>`
      ).join('') + '</div>';
    }
    if (item.content) {
      html += `<p style="font-size:13px;color:var(--text-muted);margin-top:8px">${escapeHtml(item.content)}</p>`;
    }
    $('#play-meta').innerHTML = html;
    $('#play-meta').querySelectorAll('.tag').forEach(el => {
      el.addEventListener('click', () => {
        showHome();
        doSearch(el.dataset.q);
      });
    });
  }

  function renderEpisodes(item) {
    const box = $('#ep-list');
    box.innerHTML = '';
    (item.episodes || []).forEach((ep, i) => {
      const btn = document.createElement('button');
      btn.textContent = ep.name || `第${i + 1}集`;
      if (i === state.epIndex) btn.classList.add('active');
      btn.addEventListener('click', () => playEpisode(i));
      box.appendChild(btn);
    });
  }

  function playEpisode(index) {
    const item = state.current;
    if (!item || !item.episodes[index]) return;
    state.epIndex = index;
    $$('#ep-list button').forEach((b, i) => b.classList.toggle('active', i === index));
    const url = item.episodes[index].url;
    $('#direct-url').value = url;
    Player.play(url);
  }

  function doSearch(q) {
    state.keyword = (q || '').trim();
    $('#search-input').value = state.keyword;
    state.category = 'all';
    $$('.nav-cats button').forEach(b => b.classList.toggle('active', b.dataset.cat === 'all'));
    showHome();
    loadList(true);
  }

  // —— 源面板 ——
  async function openSourcePanel() {
    $('#source-modal').classList.remove('hidden');
    const listEl = $('#source-list');
    listEl.innerHTML = '<div class="status"><div class="spinner"></div>扫描中…</div>';
    const results = await API.probeAll();
    listEl.innerHTML = '';
    results
      .sort((a, b) => (b.ok ? 1 : 0) - (a.ok ? 1 : 0) || a.ms - b.ms)
      .forEach(r => {
        const row = document.createElement('div');
        row.className = 'source-row';
        const checked = C.ACTIVE_SOURCES.includes(r.source.id) ? 'checked' : '';
        const status = r.ok
          ? `<span class="badge-ok">✓ ${r.ms}ms · ${r.total}部${r.hasMeta ? ' · 资料全' : ''}</span>`
          : `<span class="badge-fail">✗ ${escapeHtml(r.error || '失败')}</span>`;
        row.innerHTML = `
          <label>
            <input type="checkbox" data-id="${r.source.id}" ${checked} ${r.ok ? '' : 'disabled'}>
            <strong>${escapeHtml(r.source.name)}</strong>
          </label>
          ${status}
        `;
        listEl.appendChild(row);
      });
  }

  function applySources() {
    const ids = [...$$('#source-list input:checked')].map(el => el.dataset.id).slice(0, 3);
    if (!ids.length) {
      alert('请至少选择 1 个可用源');
      return;
    }
    C.ACTIVE_SOURCES = ids;
    saveStorage();
    $('#source-modal').classList.add('hidden');
    state.keyword = '';
    $('#search-input').value = '';
    loadList(true);
  }

  function bind() {
    $('#search-btn').addEventListener('click', () => doSearch($('#search-input').value));
    $('#search-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') doSearch(e.target.value);
    });
    $('#btn-update-source').addEventListener('click', openSourcePanel);
    $('#btn-apply-sources').addEventListener('click', applySources);
    $('#btn-close-modal').addEventListener('click', () => $('#source-modal').classList.add('hidden'));
    $('#btn-best').addEventListener('click', () => {
      $$('#source-list input:not(:disabled)').forEach((el, i) => { el.checked = i < 3; });
    });
    $('#load-more').addEventListener('click', () => {
      state.page++;
      loadList(false);
    });
    $('#btn-back').addEventListener('click', () => {
      showHome();
      if (!state.items.length) loadList(true);
    });
    $('#ad-filter').addEventListener('change', e => {
      Player.setAdFilter(e.target.checked);
      if (state.current && state.current.episodes[state.epIndex]) {
        playEpisode(state.epIndex);
      }
    });
    $('#btn-copy-link').addEventListener('click', () => {
      const v = $('#direct-url').value;
      if (!v) return;
      navigator.clipboard.writeText(v).then(() => {
        $('#btn-copy-link').textContent = '已复制';
        setTimeout(() => { $('#btn-copy-link').textContent = '复制直链'; }, 1500);
      });
    });

    $$('.nav-cats button').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.nav-cats button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.category = btn.dataset.cat;
        state.keyword = '';
        $('#search-input').value = '';
        loadList(true);
      });
    });
  }

  function init() {
    loadStorage();
    Player.init($('#video'));
    bind();
    showHome();
    loadList(true);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
