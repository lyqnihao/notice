/**
 * 请求、成人过滤、去重、跨源聚合
 */
(function () {
  const C = window.CLEANVID;

  function proxyUrl(url) {
    if (!C.CORS_PROXY) return url;
    return C.CORS_PROXY + encodeURIComponent(url);
  }

  async function fetchJson(url, timeout = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(proxyUrl(url), {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function isAdultItem(item) {
    const type = (item.type_name || item.type || '') + '';
    const name = (item.vod_name || item.name || '') + '';
    const actor = (item.vod_actor || '') + '';
    const tags = (item.vod_tag || item.vod_class || '') + '';
    const blob = (type + ' ' + name + ' ' + actor + ' ' + tags).toLowerCase();

    for (const k of C.ADULT_TYPE_KEYWORDS) {
      if (type.includes(k)) return true;
    }
    for (const k of C.ADULT_KEYWORDS) {
      if (blob.includes(k.toLowerCase())) return true;
    }
    return false;
  }

  function normalizeItem(raw, source) {
    if (!raw || isAdultItem(raw)) return null;
    const playUrl = raw.vod_play_url || '';
    const episodes = parsePlayUrl(playUrl);
    return {
      id: String(raw.vod_id || raw.id),
      sourceId: source.id,
      sourceName: source.name,
      name: raw.vod_name || raw.name || '未知',
      pic: raw.vod_pic || raw.pic || '',
      type: raw.type_name || '',
      typeId: raw.type_id,
      remarks: raw.vod_remarks || '',
      actor: raw.vod_actor || '',
      director: raw.vod_director || '',
      year: raw.vod_year || '',
      area: raw.vod_area || '',
      lang: raw.vod_lang || '',
      content: (raw.vod_content || '').replace(/<[^>]+>/g, '').slice(0, 500),
      tags: (raw.vod_tag || raw.vod_class || '').split(/[,，/\s]+/).filter(Boolean),
      time: raw.vod_time || '',
      playFrom: raw.vod_play_from || '',
      episodes,
      raw
    };
  }

  /** 解析 "第1集$url1#第2集$url2" 或 "正片$url" */
  function parsePlayUrl(str) {
    if (!str) return [];
    const list = [];
    const parts = str.split('#');
    for (const p of parts) {
      const idx = p.indexOf('$');
      if (idx === -1) continue;
      const name = p.slice(0, idx).trim() || '正片';
      const url = p.slice(idx + 1).trim();
      if (url) list.push({ name, url });
    }
    return list;
  }

  function getActiveSources() {
    const ids = C.ACTIVE_SOURCES || [];
    return C.SOURCE_POOL.filter(s => ids.includes(s.id));
  }

  async function listFromSource(source, page = 1, extra = {}) {
    let url = `${source.api}?ac=list&pg=${page}&pagesize=${C.PAGE_SIZE}`;
    if (extra.wd) url += '&wd=' + encodeURIComponent(extra.wd);
    if (extra.t) url += '&t=' + extra.t;
    if (extra.h) url += '&h=' + extra.h;
    const data = await fetchJson(url);
    const list = (data.list || data.data || []).map(r => normalizeItem(r, source)).filter(Boolean);
    return {
      list,
      total: data.total || 0,
      page: data.page || page,
      pagecount: data.pagecount || 1
    };
  }

  async function detailFromSource(source, id) {
    const url = `${source.api}?ac=detail&ids=${id}`;
    const data = await fetchJson(url);
    const raw = (data.list || [])[0];
    return normalizeItem(raw, source);
  }

  /** 多源并行列表，按名称去重 */
  async function aggregateList(page = 1, opts = {}) {
    const sources = getActiveSources();
    const results = await Promise.allSettled(
      sources.map(s => listFromSource(s, page, opts))
    );
    const map = new Map();
    const order = [];
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const src = sources[i];
      for (const item of r.value.list) {
        const key = item.name.replace(/\s+/g, '').toLowerCase();
        if (!map.has(key)) {
          map.set(key, item);
          order.push(key);
        } else {
          // 保留演员信息更全的那条
          const old = map.get(key);
          if ((item.actor || '').length > (old.actor || '').length) {
            map.set(key, { ...item, sources: (old.sources || [old.sourceId]).concat(item.sourceId) });
          }
        }
      }
    });
    return order.map(k => map.get(k));
  }

  async function aggregateSearch(keyword) {
    return aggregateList(1, { wd: keyword });
  }

  async function getDetail(sourceId, id) {
    const source = C.SOURCE_POOL.find(s => s.id === sourceId);
    if (!source) throw new Error('源不存在');
    return detailFromSource(source, id);
  }

  /** 探测单个源 */
  async function probeSource(source) {
    const t0 = Date.now();
    try {
      const data = await fetchJson(`${source.api}?ac=list&pg=1&pagesize=1`, 8000);
      const ms = Date.now() - t0;
      const total = data.total || 0;
      const sample = (data.list || [])[0];
      const hasMeta = !!(sample && (sample.vod_actor || sample.vod_director));
      return { ok: true, ms, total, hasMeta, source };
    } catch (e) {
      return { ok: false, ms: Date.now() - t0, error: e.message, source };
    }
  }

  async function probeAll() {
    return Promise.all(C.SOURCE_POOL.map(probeSource));
  }

  window.CleanAPI = {
    listFromSource,
    aggregateList,
    aggregateSearch,
    getDetail,
    probeSource,
    probeAll,
    getActiveSources,
    isAdultItem,
    parsePlayUrl
  };
})();
