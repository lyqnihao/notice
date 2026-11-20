/* ============================================================
   夜潮 NOCTIDE v3.2.3 —— 核心纯逻辑模块 signal-core.js
   无 DOM 依赖：浏览器挂到 window.NC，Node 端可 require 做单元测试。
   覆盖：时间格式化 / Base58 / M3U8 广告过滤 / 订阅解析 /
         订阅增量合并 / 请求模式与中继 / 错误分类。
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NC = Object.assign(root.NC || {}, api);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  /* ── 时间格式化：秒 → mm:ss / h:mm:ss（任务书示例 01:23:45） ── */
  function fmtClock(s) {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    const sec = String(s % 60).padStart(2, '0');
    const min = String(Math.floor(s / 60) % 60).padStart(2, '0');
    const hr = Math.floor(s / 3600);
    return hr > 0 ? String(hr).padStart(2, '0') + ':' + min + ':' + sec : min + ':' + sec;
  }

  /* ── Base58 编解码（LunaTV 分享配置常用） ───────────────────── */
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const B58MAP = (() => { const m = {}; for (let i = 0; i < B58.length; i++) m[B58[i]] = i; return m; })();

  function base58Decode(str) {
    str = String(str || '').replace(/\s+/g, '');
    if (!str) throw new Error('Base58 内容为空');
    let bytes = [0];
    for (const ch of str) {
      const v = B58MAP[ch];
      if (v === undefined) throw new Error('非法 Base58 字符：' + ch);
      let carry = v;
      for (let i = 0; i < bytes.length; i++) {
        carry += bytes[i] * 58;
        bytes[i] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
    }
    // 前导 '1' 对应前导零字节
    for (let k = 0; k < str.length && str[k] === '1'; k++) bytes.push(0);
    bytes.reverse();
    return Uint8Array.from(bytes);
  }

  function base58Encode(buf) {
    const bytes = typeof buf === 'string' ? utf8Encode(buf) : (buf instanceof Uint8Array ? buf : new Uint8Array(buf));
    if (!bytes.length) return '';
    let digits = [0];
    for (const byte of bytes) {
      let carry = byte;
      for (let i = 0; i < digits.length; i++) {
        carry += digits[i] << 8;
        digits[i] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
    }
    let out = '';
    for (let k = 0; k < bytes.length && bytes[k] === 0; k++) out += '1';
    for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
    return out;
  }

  function utf8Encode(s) {
    // 浏览器用 TextEncoder，Node 亦有全局 TextEncoder；兜底手写
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else if (c >= 0xd800 && c <= 0xdbff) {
        const c2 = s.charCodeAt(++i);
        c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return Uint8Array.from(out);
  }

  function utf8Decode(buf) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(buf);
    let s = '';
    for (const b of buf) s += String.fromCharCode(b);
    try { return decodeURIComponent(escape(s)); } catch (_) { return s; }
  }

  /* 尝试把文本解析成订阅 JSON：直接 JSON → 否则当 Base58 解码再 JSON */
  function decodeSubscriptionText(raw) {
    const text = String(raw || '').trim();
    if (!text) throw new Error('订阅内容为空');
    // 直接 JSON
    try { return { data: JSON.parse(text), via: 'json' }; } catch (_) { /* 继续 */ }
    // Base58（要求字符集全部合法，避免把普通文本误判）
    if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(text) && text.length > 8) {
      try {
        const decoded = utf8Decode(base58Decode(text));
        const data = JSON.parse(decoded);
        return { data, via: 'base58' };
      } catch (_) { /* 落到下面的错误 */ }
    }
    throw new Error('订阅内容既不是合法 JSON，也不是可解码的 Base58 配置');
  }

  /* ── M3U8 广告过滤（基于目录分布的启发式，复用 TIDEFLOW 方案并增强） ── */
  function isMediaSegment(line, base) {
    const t = String(line || '').trim();
    if (!t || t.startsWith('#')) return false;
    let u;
    try { u = new URL(t, base); } catch (_) { return false; }
    const path = u.pathname.toLowerCase();
    // master 列表里的子 m3u8 变体不算媒体片段；只认常见分片扩展名
    if (/\.m3u8?$/i.test(path)) return false;
    return /\.(ts|m4s|mp4|aac|flv|mp3|webm|seg|dat)(\?|$)/i.test(t) ||
      /\.(ts|m4s|mp4|aac|flv|mp3|webm|seg|dat)$/i.test(path) ||
      /\/segment|\/seg\d|\.ts\?/i.test(t);
  }

  function dirOfSegment(line, base) {
    let u = new URL(String(line).trim(), base);
    const p = u.pathname;
    return u.origin + p.substring(0, p.lastIndexOf('/') + 1);
  }

  /* 过滤异目录广告分段。返回 {text, removed, changed, mainDir, total}。
     分布不明显 / 样本过少 / 无媒体片段 → 原样返回（回退）。 */
  function stripForeignSegments(text, baseUrl) {
    const text0 = String(text || '');
    let base;
    try { base = new URL(baseUrl); } catch (_) {
      return { text: text0, removed: 0, changed: false, mainDir: '', total: 0, reason: 'base_url_invalid' };
    }
    const lines = text0.split(/\r?\n/);
    const dirs = {};
    let total = 0;
    lines.forEach(line => {
      if (!isMediaSegment(line, base.href)) return;
      total++;
      const d = dirOfSegment(line, base.href);
      dirs[d] = (dirs[d] || 0) + 1;
    });
    // 样本过少（<4 段）不做判断，避免误伤正常短片
    if (total < 4) return { text: text0, removed: 0, changed: false, mainDir: '', total, reason: 'too_few_segments' };
    const mainDir = Object.keys(dirs).sort((a, b) => dirs[b] - dirs[a])[0];
    // 主目录占比 < 60% → 目录分布不明显，不启用过滤
    if (dirs[mainDir] < total * 0.6) {
      return { text: text0, removed: 0, changed: false, mainDir, total, reason: 'distribution_unclear' };
    }
    const out = [];
    let removed = 0;
    for (const line of lines) {
      if (isMediaSegment(line, base.href)) {
        const d = dirOfSegment(line, base.href);
        if (d === mainDir) {
          out.push(line);
        } else {
          removed++;
          // 丢弃属于该广告分片的 EXTINF / EXT-X-BYTERANGE 元信息
          while (out.length && (/^#EXTINF:/.test(out[out.length - 1]) || /^#EXT-X-BYTERANGE:/.test(out[out.length - 1]))) out.pop();
        }
      } else {
        out.push(line);
      }
    }
    // 过滤后若剩余媒体片段为 0，视为异常，回退原文（绝不把正片删空）
    const remaining = out.filter(l => isMediaSegment(l, base.href)).length;
    if (!removed || remaining === 0) {
      return { text: text0, removed: 0, changed: false, mainDir, total, reason: 'guard_fallback' };
    }
    return { text: out.join('\n'), removed, changed: true, mainDir, total };
  }

  function countRemovedSegments(orig, filtered) {
    const c = t => String(t || '').split(/\r?\n/).filter(l => isMediaSegment(l, 'http://x/y.m3u8')).length;
    return Math.max(0, c(orig) - c(filtered));
  }

  /* 把播放列表里的相对分片 / KEY / MAP URI 重写为绝对地址（blob 播放需要） */
  function absolutizeSegments(text, baseUrl) {
    return String(text || '').split(/\r?\n/).map(line => {
      const t = line.trim();
      if (!t || t.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (m, u) => {
          if (/^[a-z]+:\/\//i.test(u)) return m;
          try { return 'URI="' + new URL(u, baseUrl).href + '"'; } catch (_) { return m; }
        });
      }
      try { return new URL(t, baseUrl).href; } catch (_) { return line; }
    }).join('\n');
  }

  /* master 列表 → 第一个子码率 m3u8 绝对地址；没有则返回 null */
  function firstVariantUrl(text, baseUrl) {
    const m = String(text || '').match(/^([^#\s][^\n]*\.m3u8[^\n]*)$/m);
    if (!m) return null;
    try { return new URL(m[1].trim(), baseUrl).href; } catch (_) { return null; }
  }

  /* ── 订阅地址 → 线路数组（多格式全面兼容） ─────────────────── */

  const NAME_KEYS = ['name', 'title', 'key', 'siteName'];
  const API_KEYS = ['api', 'url', 'apiUrl', 'baseUrl'];
  const DESC_KEYS = ['remark', 'description', 'detail', 'note'];
  const TAG_KEYS = ['tags', 'tag'];
  const ENABLE_KEYS = ['enabled', 'isActive', 'active'];

  function pick(obj, keys) {
    for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
    return '';
  }
  function toBool(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return !/^(false|0|no|off)$/i.test(v.trim());
    return true;
  }
  function toTags(v) {
    if (Array.isArray(v)) return v.map(String).filter(Boolean);
    if (typeof v === 'string' && v.trim()) return v.split(/[,，\s]+/).filter(Boolean);
    return [];
  }

  /* API URL 校验：合法 http/https + 像影视 CMS 接口。
     返回 {ok, api, inner, reason}。relay 包裹形式会解出 inner。 */
  function validateApiUrl(value) {
    let raw = String(value || '').trim();
    if (!raw) return { ok: false, reason: 'empty' };
    let u;
    try { u = new URL(raw); } catch (_) { return { ok: false, reason: 'invalid_url' }; }
    if (!['http:', 'https:'].includes(u.protocol)) return { ok: false, reason: 'bad_protocol' };
    let inner = '';
    // relay 包裹：?url=<真接口> 或 url=<真接口>
    const wrapped = u.searchParams.get('url');
    if (wrapped && /^https?:\/\//i.test(wrapped)) {
      inner = wrapped;
      try {
        const iu = new URL(inner);
        if (!['http:', 'https:'].includes(iu.protocol)) return { ok: false, reason: 'bad_protocol' };
      } catch (_) { return { ok: false, reason: 'bad_inner' }; }
    }
    const target = inner || raw;
    // 影视 CMS 接口特征：api.php / provide / vod / 带 ac= 参数
    const looksCms = /api\.php|provide\/vod|\/vod|ac=|api\//i.test(target) ||
      /(^|\/)(api|caiji|collect)(\/|$)/i.test(new URL(target).pathname);
    if (!looksCms) return { ok: false, reason: 'not_cms_api', inner: inner || undefined };
    // 明显是播放直链而非 CMS 接口 → 拒绝（防止误导入 TVBox 直链）
    if (/\.(m3u8?|mp4|mkv|avi|ts)(\?|$)/i.test(target) && !/api\.php|provide\/vod/i.test(target)) {
      return { ok: false, reason: 'media_url_not_api' };
    }
    return { ok: true, api: raw, inner: inner || '' };
  }

  function stableId(seed, prefix) {
    let h = 0;
    const s = String(seed || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return (prefix || 'src') + '_' + Math.abs(h).toString(36);
  }
  function normApi(api) {
    const v = validateApiUrl(api);
    const target = v.inner || api;
    try {
      const u = new URL(target);
      return u.host.toLowerCase() + u.pathname.replace(/\/+$/, '').toLowerCase();
    } catch (_) { return String(api).replace(/\/+$/, '').toLowerCase(); }
  }

  /* 检测整体是否为不支持的 TVBox 播放配置（含 urls/parses/spider/jiexi）*/
  function looksLikeTvBox(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    const hasUrls = Array.isArray(data.urls) && data.urls.length > 0;
    const hasParses = Array.isArray(data.parses) && data.parses.length > 0;
    const hasSpider = typeof data.spider === 'string' || (data.spider && typeof data.spider === 'object');
    const hasJiexi = !!data.jiexi || !!data.jx;
    return (hasUrls && hasParses) || hasSpider || hasJiexi;
  }

  function collectRawRows(data) {
    const rows = [];
    if (Array.isArray(data)) return data.slice();
    if (!data || typeof data !== 'object') return rows;
    // LunaTV / MoonTV：api_site 是对象
    if (data.api_site && typeof data.api_site === 'object' && !Array.isArray(data.api_site)) {
      Object.entries(data.api_site).forEach(([k, v]) => {
        if (v && typeof v === 'object') rows.push(Object.assign({ key: k }, v));
      });
    }
    // 常见数组容器
    for (const key of ['sites', 'sources', 'list', 'data', 'videoSources', 'apiSites', 'items']) {
      if (Array.isArray(data[key])) rows.push.apply(rows, data[key]);
    }
    // Noctide 自身导出格式：{version, sources:[...]}（sources 上面已收集）
    return rows;
  }

  /* 解析订阅数据 → {sources, format, stats, errors}。不抛异常（除非整体不支持）。 */
  function parseSubscription(data) {
    if (looksLikeTvBox(data)) {
      return { sources: [], format: 'unsupported', stats: {}, errors: ['不支持 TVBox 播放配置/解析规则（urls/parses/spider），不能作为影视 CMS API 导入'] };
    }
    const rows = collectRawRows(data);
    if (!rows.length) {
      return { sources: [], format: 'empty', stats: {}, errors: ['订阅内容中没有可识别的线路数组（sites/sources/list/data/api_site）'] };
    }
    const sources = [];
    const seenId = new Set();
    const seenApi = new Set();
    const errors = [];
    let skipped = 0;
    rows.forEach((r, i) => {
      if (!r || typeof r !== 'object') { skipped++; return; }
      const nameRaw = pick(r, NAME_KEYS) || ('订阅线路 ' + (i + 1));
      const name = String(nameRaw).replace(/[🎬\s\-–—]+/g, '').trim() || ('订阅线路 ' + (i + 1));
      const apiRaw = pick(r, API_KEYS);
      const check = validateApiUrl(apiRaw);
      if (!check.ok) { skipped++; return; }
      let id = r.id || r.key || r.siteName || '';
      id = id ? String(id) : stableId(check.api, 'sub');
      const apiKey = normApi(check.api);
      if (seenId.has(id) || seenApi.has(apiKey)) { skipped++; return; }
      seenId.add(id); seenApi.add(apiKey);
      sources.push({
        id, name,
        api: check.api,
        note: String(pick(r, DESC_KEYS) || ''),
        detail: String(r.detail || ''),
        tags: toTags(pick(r, TAG_KEYS)),
        enabled: toBool(pick(r, ENABLE_KEYS) !== '' ? pick(r, ENABLE_KEYS) : true),
        nsfw: isNsfwSource({ name, nsfw: r.nsfw }),
        origin: 'subscription',
        type: r.type, priority: r.priority,
        proxyMode: r.proxyMode || '', customProxy: r.customProxy || '',
      });
    });
    const format = Array.isArray(data) ? 'array'
      : (data && data.api_site ? 'api_site' : (data && Array.isArray(data.sites) ? 'sites' : 'object'));
    if (!sources.length && errors.length === 0) errors.push('未解析出任何有效的影视 CMS 接口地址');
    return { sources, format, stats: { total: rows.length, parsed: sources.length, skipped }, errors };
  }

  /* 解析订阅文本（支持 JSON / Base58），再调用 parseSubscription */
  function parseSubscriptionFromText(raw) {
    const decoded = decodeSubscriptionText(raw);
    const result = parseSubscription(decoded.data);
    result.via = decoded.via;
    return result;
  }

  /* 订阅增量合并：返回 {sources, stats, errors}，绝不删除手动资源或失败清空。
     current: 现有全部线路；incoming: parseSubscription 的 sources；sub: 订阅对象。 */
  function mergeSubscription(current, incoming, sub) {
    const stats = { added: 0, updated: 0, removed: 0, skipped: 0, failed: 0 };
    const errors = [];
    if (!Array.isArray(incoming)) {
      return { sources: current, stats: Object.assign(stats, { failed: 1 }), errors: ['解析结果为空，保留原有资源'] };
    }
    if (!incoming.length) {
      return { sources: current, stats, errors: ['解析出空数组，按安全策略不清空原有资源'] };
    }
    const out = current.slice();
    const subId = sub && sub.id ? sub.id : '';
    const ownedIds = new Set(out.filter(s => s.subscriptionId === subId).map(s => String(s.id)));
    const incomingIds = new Set();
    const manualApiKeys = new Set(out.filter(s => s.origin === 'manual').map(s => normApi(s.api)));

    incoming.forEach((inc, i) => {
      const id = inc.id || (subId + '_' + i);
      const incApiKey = normApi(inc.api);
      // 与手动资源冲突：不覆盖用户手动配置
      if (manualApiKeys.has(incApiKey)) { stats.skipped++; return; }
      incomingIds.add(String(id));
      const idx = out.findIndex(s => String(s.id) === String(id));
      if (idx > -1) {
        const old = out[idx];
        // 订阅资源之间也要避免重复 API
        const dup = out.some((s, j) => j !== idx && s.subscriptionId === subId && normApi(s.api) === incApiKey);
        if (dup) { stats.skipped++; return; }
        out[idx] = Object.assign({}, old, {
          name: inc.name, api: inc.api, note: inc.note, detail: inc.detail,
          tags: inc.tags, enabled: inc.enabled, type: inc.type,
          priority: inc.priority, proxyMode: inc.proxyMode, customProxy: inc.customProxy,
          subscriptionId: subId, origin: 'subscription', lastChecked: '', status: '未检测',
        });
        stats.updated++;
      } else {
        out.push(Object.assign({}, inc, { id, subscriptionId: subId, origin: 'subscription' }));
        stats.added++;
      }
    });
    // 删除已从该订阅移除的旧资源（仅限本订阅归属，且不在本次 incoming 中）；手动资源永不删除
    const before = out.length;
    const kept = out.filter(s => !(ownedIds.has(String(s.id)) && !incomingIds.has(String(s.id)) && s.origin !== 'manual'));
    stats.removed = before - kept.length;
    return { sources: kept, stats, errors };
  }

  /* ── 请求模式与中继 ────────────────────────────────────────── */

  // 参考 TIDEFLOW：内置一个默认中继，使「直连失败回退」开箱即用。
  // 公共代理有隐私/日志风险：用户可在资源站管理里填入自己的 relay 覆盖，
  // 或选择「纯直连」彻底不走代理。此地址仅为候选，不保证长期可用。
  const DEFAULT_RELAY = 'https://pz.v88.qzz.io/?url=';

  function lunaRelay(url, relayBase) {
    const base = String(relayBase || DEFAULT_RELAY || '').trim();
    if (!base) return '';
    return base + encodeURIComponent(url);
  }

  // 站点级内容安全过滤：命中敏感关键词/敏感源则判为 NSFW（参考 TIDEFLOW config.js）
  const NSFW_KEYWORDS = [
    'porn', 'xxx', 'nsfw', 'adult', 'erotic', 'erotica', 'hentai', 'sex', 'sexual', 'nude', 'naked',
    '成人', '色情', '情色', '淫', '露点', '性爱', '裸体', '三级片', '18禁', '麻豆', '果冻', '蜜桃', '淫媒', '情欲', '约炮', '萝莉', '迷奸', '偷情'
  ].map(k => k.toLowerCase());
  const NSFW_SOURCE_HINT = /[🔞😈]|91md|麻豆|成人|情色|果冻|果豆|蜜桃|淫|成人视频|av女优/i;
  function isNsfwText(text) {
    const hay = String(text || '').toLowerCase();
    if (!hay) return false;
    if (NSFW_SOURCE_HINT.test(hay)) return true;
    for (const k of NSFW_KEYWORDS) {
      if (/^[\x00-\x7f]+$/.test(k)) { if (new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(hay)) return true; }
      else if (hay.indexOf(k) > -1) return true;
    }
    return false;
  }
  // 判断一条线路是否为 NSFW（显式标记 or 名称命中提示词）
  function isNsfwSource(s) {
    return !!(s && (s.nsfw || (s.name && NSFW_SOURCE_HINT.test(String(s.name)))));
  }

  function withTimeout(promise, ms) {
    if (!ms || ms <= 0) return promise;
    let timer;
    const to = new Promise((_, rej) => { timer = setTimeout(() => { const e = new Error('请求超时'); e.name = 'TimeoutError'; rej(e); }, ms); });
    return Promise.race([promise, to]).finally(() => clearTimeout(timer));
  }

  /* 统一 fetch：根据 mode 决定直连/中继顺序。fetchImpl 可注入以便测试。 */
  async function fetchWithMode(url, opts) {
    const o = opts || {};
    const mode = o.mode || 'relay-first'; // relay-first | fallback | direct（默认优先中继，对齐 TIDEFLOW）
    const timeout = o.timeout || 10000;
    const relayBase = o.relay || DEFAULT_RELAY;
    const fetchImpl = o.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchImpl) throw new Error('当前环境不支持 fetch');
    const relayUrl = lunaRelay(url, relayBase);
    const canRelay = !!relayUrl;
    const attempts = [];
    if (mode === 'direct') attempts.push({ via: 'direct', url });
    else if (mode === 'relay-first') {
      if (canRelay) attempts.push({ via: 'relay', url: relayUrl });
      attempts.push({ via: 'direct', url });
    } else { // fallback：直连优先，失败再 relay
      attempts.push({ via: 'direct', url });
      if (canRelay) attempts.push({ via: 'relay', url: relayUrl });
    }
    const errs = [];
    for (const a of attempts) {
      try {
        const res = await withTimeout(fetchImpl(a.url, Object.assign({}, o.fetchOptions || {}, { signal: o.signal })), timeout);
        if (!res.ok) { errs.push({ via: a.via, error: 'HTTP ' + res.status }); continue; }
        return { response: res, via: a.via, relayUsed: a.via === 'relay', errors: errs };
      } catch (e) {
        errs.push({ via: a.via, error: e });
      }
    }
    const err = new Error('所有请求方式均失败');
    err.attempts = errs;
    throw err;
  }

  /* 错误分类：Abort/超时、HTTP、跨域/网络、格式、HTML、中继 */
  function classifyError(e, via) {
    if (!e) return { code: 'unknown', label: '未知错误' };
    if (e.name === 'AbortError' || e.name === 'TimeoutError' || /timeout|abort|超时/i.test(e.message || '')) {
      return { code: 'timeout', label: '请求超时' };
    }
    if (/HTTP\s+\d+/i.test(e.message || '')) {
      const m = e.message.match(/HTTP\s+(\d+)/i);
      return { code: 'http', label: 'HTTP 错误 ' + (m ? m[1] : ''), status: m ? Number(m[1]) : 0 };
    }
    if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(e.message || '')) {
      return { code: 'cors_network', label: '跨域或网络失败' };
    }
    if (e.code === 'html' || /html|<!doctype|<html/i.test(e.message || '')) {
      return { code: 'html', label: '响应格式错误（返回 HTML）' };
    }
    if (e.code === 'relay' || (via === 'relay' && e.attempts)) {
      return { code: 'relay', label: '中继不可用' };
    }
    return { code: 'format', label: '响应格式错误：' + (e.message || '无法解析') };
  }

  /* 判断文本是否为 HTML（订阅误返回登录/限流页） */
  function isHtml(text) {
    return /^\s*<!doctype\s+html|^\s*<html[\s>]/i.test(String(text || '').slice(0, 300));
  }

  return {
    fmtClock,
    base58Decode, base58Encode, decodeSubscriptionText,
    stripForeignSegments, countRemovedSegments, absolutizeSegments, firstVariantUrl, isMediaSegment,
    validateApiUrl, parseSubscription, parseSubscriptionFromText, mergeSubscription,
    looksLikeTvBox, normApi, stableId,
    lunaRelay, fetchWithMode, withTimeout, classifyError, isHtml,
    DEFAULT_RELAY, isNsfwText, isNsfwSource,
  };
});
