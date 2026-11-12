/* ===== Sun Nav 导航页逻辑 v1.4.0-test.1（自动获取站点信息 · 测试版） ===== */
(function () {
'use strict';

/* ---------- 版本号（侧栏底部展示，修改时同步 README / data.js 头部注释） ---------- */
var APP_VERSION = 'v1.4.0-test.1';
/* 重置后保留的固定功能分组名 */
var TOOL_GROUP_TITLE = '功能工具';

/* ---------- 搜索引擎 ---------- */
var ENGINES = [
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=' },
  { id: 'bing', name: '必应', url: 'https://www.bing.com/search?q=' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=' },
  { id: 'sogou', name: '搜狗', url: 'https://www.sogou.com/web?query=' },
  { id: 'so360', name: '360', url: 'https://www.so.com/s?q=' },
  { id: 'ddg', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=' },
  { id: 'yt', name: 'YouTube', url: 'https://www.youtube.com/results?search_query=' }
];
var DEFAULT_ENGINE = 'bing';
var ENGINE_CUSTOM_KEY = 'sun-nav-engines-custom';
function getEngines() {
  try {
    var c = JSON.parse(localStorage.getItem(ENGINE_CUSTOM_KEY) || 'null');
    if (Array.isArray(c) && c.length) return c;
  } catch (e) {}
  return ENGINES;
}
function saveCustomEngines(list) {
  try { localStorage.setItem(ENGINE_CUSTOM_KEY, JSON.stringify(list)); } catch (e) {}
}
function engineUrl(en, q) {
  if (en.url.indexOf('{q}') >= 0) return en.url.replace('{q}', encodeURIComponent(q));
  return en.url + encodeURIComponent(q);
}

/* ---------- 存储键 ---------- */
var LS_DATA = 'sun-nav-data-v1';
var LS_THEME = 'sun-nav-theme';
var LS_ENGINE = 'sun-nav-engines';

/* ---------- 状态 ---------- */
var state = {
  groups: [],
  activeGroup: null,   // null = 全部
  query: '',
  engines: new Set()
};

/* ---------- 工具 ---------- */
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
function $(id) { return document.getElementById(id); }
function el(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
var toastTimer = null;
function toast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 2600);
}
function faviconFor(url) {
  if (!url) return '';
  try {
    var u = new URL(url);
    return 'https://' + u.hostname + '/favicon.ico';
  } catch (e) { return ''; }
}

/* ================================================================
 * 自动获取站点信息（测试版 v1.4.0-test.1）
 * ----------------------------------------------------------------
 * 三级降级，任一成功即填充；只写【空白】字段，绝不覆盖用户已填内容：
 *   A  同源 Worker  /api/meta?url=   —— Cloudflare Worker 部署时，服务端抓取，最可靠
 *   B  公共元数据 / 代理服务          —— 纯静态部署（GitHub Pages / 静态预览站等）时的兜底
 *   C  favicon 多源 <img> 直连探测    —— 不受 CORS 限制，几乎总能拿到图标
 * 所有字段始终开放可编辑；自动填入的字段加 .autofilled 标记，用户一改动即移除。
 * ================================================================ */
var META_TIMEOUT = 7000;
var META_PROXIES = [
  { name: 'microlink', type: 'microlink', url: function (u) { return 'https://api.microlink.io/?url=' + encodeURIComponent(u); } },
  { name: 'whateverorigin', type: 'wrap', url: function (u) { return 'https://www.whateverorigin.org/get?url=' + encodeURIComponent(u); } },
  { name: 'allorigins', type: 'html', url: function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); } },
  { name: 'codetabs', type: 'html', url: function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); } }
];

function normalizeTargetUrl(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  try {
    var u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    if (!u.hostname || u.hostname.indexOf('.') < 0) return '';
    return u.href;
  } catch (e) { return ''; }
}

function cleanMetaText(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

function metaFromHtml(html, baseUrl) {
  var out = { title: '', description: '', logo: '' };
  try {
    var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    var pick = function (sel) {
      var n = doc.querySelector(sel);
      return n ? cleanMetaText(n.getAttribute('content')) : '';
    };
    var t = doc.querySelector('title');
    out.title = t ? cleanMetaText(t.textContent) : '';
    var ogTitle = pick('meta[property="og:title"]') || pick('meta[name="twitter:title"]');
    if (ogTitle) out.title = ogTitle;
    out.description = pick('meta[name="description"]') || pick('meta[property="og:description"]') || pick('meta[name="twitter:description"]');
    var icon = doc.querySelector('link[rel~="icon"]') || doc.querySelector('link[rel="apple-touch-icon"]');
    var href = icon ? cleanMetaText(icon.getAttribute('href')) : '';
    if (!href) href = pick('meta[property="og:image"]');
    if (href) { try { out.logo = new URL(href, baseUrl).href; } catch (e) {} }
  } catch (e) {}
  return out;
}

function metaFromText(text, type, baseUrl) {
  if (type === 'microlink') {
    try {
      var j = JSON.parse(text);
      if (j && j.status === 'success' && j.data) {
        var d = j.data, logo = '';
        if (d.logo) logo = (typeof d.logo === 'string') ? d.logo : (d.logo.url || '');
        if (!logo && d.image) logo = (typeof d.image === 'string') ? d.image : (d.image.url || '');
        return { title: cleanMetaText(d.title), description: cleanMetaText(d.description), logo: logo };
      }
    } catch (e) {}
    return null;
  }
  if (type === 'wrap') {
    try {
      var w = JSON.parse(text);
      if (w && typeof w.contents === 'string') return metaFromHtml(w.contents, baseUrl);
    } catch (e) {}
    return null;
  }
  return metaFromHtml(text, baseUrl);
}

function fetchMetaText(url, ms) {
  var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var timer = setTimeout(function () { try { ctrl && ctrl.abort(); } catch (e) {} }, ms || META_TIMEOUT);
  var opts = { cache: 'no-store' };
  if (ctrl) opts.signal = ctrl.signal;
  return fetch(url, opts).then(function (r) {
    clearTimeout(timer);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }, function (e) { clearTimeout(timer); throw e; });
}

/* A：同源 Worker 接口（正式 Cloudflare 部署时可用；纯静态部署返回 404/HTML 时自动跳过） */
function tryWorkerMeta(target) {
  return fetchMetaText('/api/meta?url=' + encodeURIComponent(target), 8000).then(function (txt) {
    var j = JSON.parse(txt);
    if (j && j.ok) {
      return { title: cleanMetaText(j.title), description: cleanMetaText(j.description),
               logo: j.logo || '', source: '本站 Worker' };
    }
    return null;
  }).catch(function () { return null; });
}

/* B：公共代理并行竞速，第一个给出有效结果者胜出 */
function tryProxyMeta(target) {
  return new Promise(function (resolve) {
    var pending = META_PROXIES.length, done = false;
    if (!pending) { resolve(null); return; }
    META_PROXIES.forEach(function (p) {
      fetchMetaText(p.url(target), META_TIMEOUT).then(function (txt) {
        var m = metaFromText(txt, p.type, target);
        if (m && (m.title || m.description || m.logo) && !done) {
          done = true; m.source = p.name; resolve(m);
        }
      }).catch(function () {}).then(function () {
        pending--;
        if (pending === 0 && !done) resolve(null);
      });
    });
  });
}

/* C：favicon 多源探测（<img> 加载不受 CORS 限制，302 会自动跟随） */
function logoCandidates(target, hint) {
  var host;
  try { host = new URL(target).hostname; } catch (e) { return []; }
  var list = [];
  if (hint) list.push(hint);
  list.push('https://' + host + '/favicon.ico');
  list.push('https://favicon.im/' + host + '?larger=true');
  list.push('https://api.faviconkit.com/' + host + '/64');
  list.push('https://www.google.com/s2/favicons?domain=' + host + '&sz=64');
  list.push('https://icons.duckduckgo.com/ip3/' + host + '.ico');
  return list;
}
function probeLogo(list) {
  return new Promise(function (resolve) {
    if (!list.length) { resolve(''); return; }
    var pending = list.length, done = false;
    list.forEach(function (src) {
      var img = new Image();
      var timer = setTimeout(function () { finish(false); }, 4500);
      function finish(ok) {
        clearTimeout(timer);
        img.onload = img.onerror = null;
        if (done) return;
        pending--;
        if (ok && !done) { done = true; resolve(src); }
        else if (pending === 0 && !done) { done = true; resolve(''); }
      }
      img.onload = function () { finish(img.naturalWidth >= 8); };
      img.onerror = function () { finish(false); };
      img.src = src;
    });
  });
}

/* 只填空白字段；返回被填充的字段中文名 */
function applyMetaToForm(meta) {
  var labels = { fTitle: '名称', fDesc: '描述信息', fLogo: 'Logo' };
  var filled = [];
  ['fTitle', 'fDesc', 'fLogo'].forEach(function (id) {
    var el = $(id);
    if (!el || el.value.trim()) return;                 // 已有内容 → 绝不覆盖
    var v = cleanMetaText(meta[id === 'fTitle' ? 'title' : (id === 'fDesc' ? 'description' : 'logo')]);
    if (!v) return;
    var max = parseInt(el.getAttribute('maxlength') || '0', 10);
    if (max > 0 && v.length > max) v = v.slice(0, max);
    el.value = v;
    el.classList.add('autofilled');
    filled.push(labels[id]);
  });
  return filled;
}

function setAutoHint(kind, html) {
  var h = $('autoMetaHint');
  if (!h) return;
  h.className = 'autometa-hint' + (kind ? ' ' + kind : '');
  h.innerHTML = html;
}

async function autoFetchMeta() {
  var btn = $('btnAutoMeta');
  if (!btn || btn.disabled) return;
  var target = normalizeTargetUrl($('fUrl').value);
  if (!target) { toast('请先填写正确的「外网链接」'); return; }

  btn.disabled = true;
  var oldText = btn.textContent;
  btn.textContent = '⏳ 获取中…';
  setAutoHint('', '正在获取：本站接口 → 公共服务 → 图标探测…<br><span style="opacity:.75">若本站接口不可用，网址会发送给第三方公共服务；仅用于本次查询。</span>');

  var meta = { title: '', description: '', logo: '', source: '' };
  try {
    var w = await tryWorkerMeta(target);
    if (w && (w.title || w.description || w.logo)) meta = w;
    else {
      var p = await tryProxyMeta(target);
      if (p) meta = p;
    }
    if (!$('fLogo').value.trim()) {                     // 已有 Logo 不重复探测
      var logo = await probeLogo(logoCandidates(target, meta.logo));
      if (logo) meta.logo = logo;
    }
  } catch (e) {}

  var filled = applyMetaToForm(meta);
  btn.disabled = false;
  btn.textContent = oldText;

  if (filled.length) {
    var src = meta.source || '图标探测';
    setAutoHint('ok', '✔ 已补齐 <b>' + filled.join('、') + '</b>（来源：' + escapeHtml(src) + '）。<br>所有字段仍可手动修改，改动后自动标记会消失。');
    toast('已自动补齐 ' + filled.join('、'));
  } else if (meta.title || meta.description || meta.logo) {
    setAutoHint('', '未发现空白字段，未改动任何内容。如需重新获取，请先清空对应字段。');
    toast('没有空白字段可填');
  } else {
    setAutoHint('warn', '⚠ 自动获取失败：目标站不可达 / 反爬 / 公共服务限流。<br>请手动填写，或稍后重试；已填写的内容保持不变。');
    toast('自动获取失败，请手动填写');
  }
}

/* 打开弹窗时重置自动获取状态；用户手动编辑即移除自动标记 */
function resetAutoMetaState() {
  var h = $('autoMetaHint');
  if (h) { h.className = 'autometa-hint hidden'; h.innerHTML = ''; }
  ['fTitle', 'fDesc', 'fLogo'].forEach(function (id) {
    var el = $(id);
    if (el) el.classList.remove('autofilled');
  });
  var btn = $('btnAutoMeta');
  if (btn) { btn.disabled = false; btn.textContent = '⚡ 自动获取'; }
}

/* ---------- 数据持久化与后端模式 ---------- */
var LS_PW = 'sun-nav-pw';                          // 记住的访问密码（仅本机）
var LS_LOCK = 'sun-nav-lock';                       // 本地密码的 SHA-256 哈希（开启本地锁时存在）
var LS_LOCK_SKIP = 'sun-nav-lock-skip';             // 用户选择「暂不设置」标记
var LOCK_SALT = 'sun-nav::local-lock::v1';
var backend = { mode: 'local', password: null };    // 'kv'=Cloudflare KV 云端，'local'=浏览器本地
var unlockResolve = null;                            // 密码解锁 Promise 的 resolver
var lockMode = 'server';                             // 'server'=Cloudflare 后端密码 | 'local'=本地锁 | 'setup'=首次设置
var lockAllowSkip = true;                            // 设置流程是否允许「暂不设置/取消」

/* 计算字符串 SHA-256 十六进制（用于本地密码，避免明文落盘） */
async function sha256Hex(text) {
  try {
    var data = new TextEncoder().encode(text);
    var buf = await crypto.subtle.digest('SHA-256', data);
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  } catch (e) { return 'fallback:' + text; }
}

/* 兼容旧字段名 desc -> description（与 Sun-Panel 的「描述信息」统一） */
function migrateGroups(groups) {
  if (!Array.isArray(groups)) return groups;
  groups.forEach(function (g) {
    (g.items || []).forEach(function (it) {
      if (it && it.desc != null && it.description == null) it.description = it.desc;
      if (it) delete it.desc;
    });
  });
  return groups;
}
function loadData() {
  var raw = null;
  try { raw = localStorage.getItem(LS_DATA); } catch (e) {}
  if (raw) {
    try {
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed) && parsed.length) return migrateGroups(parsed);
    } catch (e) {}
  }
  return migrateGroups(deepClone(window.SUN_PANEL_DATA || []));
}
function saveData() {
  if (backend.mode === 'kv') {
    kvPut(state.groups).catch(function (e) { toast('云端保存失败：' + e.message); });
    return;
  }
  try { localStorage.setItem(LS_DATA, JSON.stringify(state.groups)); } catch (e) {
    toast('数据较大，保存失败：' + e.message);
  }
}

/* ---------- 云端（Cloudflare KV）读写与启动流程 ---------- */
function setSyncStatus(t) { var el = $('syncStatus'); if (el) el.textContent = t; }
async function kvGet(pw) {
  var url = '/api/data' + (pw ? ('?pw=' + encodeURIComponent(pw)) : '');
  var r = await fetch(url, { cache: 'no-store' });
  if (r.status === 401) throw new Error('密码错误');
  if (!r.ok) throw new Error('云端读取失败(' + r.status + ')');
  return r.json();
}
async function kvPut(groups) {
  if (backend.mode !== 'kv') return;
  var url = '/api/data' + (backend.password ? ('?pw=' + encodeURIComponent(backend.password)) : '');
  var r = await fetch(url, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(groups)
  });
  if (r.status === 401) throw new Error('密码错误');
  if (!r.ok) throw new Error('云端保存失败(' + r.status + ')');
}
function applyData(d) {
  if (Array.isArray(d) && d.length) state.groups = migrateGroups(d);
  else state.groups = loadData();
}
function waitUnlock() { return new Promise(function (res) { unlockResolve = res; }); }
function showLock() {
  var s = $('lockScreen'); if (s) s.classList.remove('hidden');
  var i = $('lockPass'); if (i) { i.value = ''; i.focus(); }
  var i2 = $('lockPass2'); if (i2) i2.value = '';
  var err = $('lockErr'); if (err) err.textContent = '';
}
function hideLock() { var s = $('lockScreen'); if (s) s.classList.add('hidden'); }
/* 根据 lockMode 调整锁屏文案与可见控件 */
function applyLockUI() {
  var title = $('lockTitle'), p2 = $('lockPass2'), skip = $('lockSkip'),
      submit = $('lockSubmit'), remember = $('lockRememberRow'), hint = $('lockHint');
  if (lockMode === 'setup') {
    if (title) title.textContent = '设置访问密码';
    if (hint) hint.textContent = '首次使用，请设置一个访问密码以加密保护本机导航（可暂不设置）。';
    if (p2) p2.classList.remove('hidden');
    if (skip) { skip.classList.remove('hidden'); skip.textContent = lockAllowSkip ? '暂不设置' : '取消'; }
    if (submit) submit.textContent = '设置并进入';
    if (remember) remember.classList.add('hidden');
  } else if (lockMode === 'local') {
    if (title) title.textContent = '输入访问密码';
    if (hint) hint.textContent = '本机已启用访问密码，请输入密码后进入。';
    if (p2) p2.classList.add('hidden');
    if (skip) skip.classList.add('hidden');
    if (submit) submit.textContent = '进入';
    if (remember) remember.classList.remove('hidden');
  } else { /* server */
    if (title) title.textContent = '输入访问密码';
    if (hint) hint.textContent = '';
    if (p2) p2.classList.add('hidden');
    if (skip) skip.classList.add('hidden');
    if (submit) submit.textContent = '进入';
    if (remember) remember.classList.remove('hidden');
  }
}
async function bootData() {
  try {
    var r = await fetch('/api/data', { cache: 'no-store' });
    if (r.status === 401) {
      backend.mode = 'kv';
      var saved = null;
      try { saved = localStorage.getItem(LS_PW); } catch (e) {}
      if (saved) {
        try { applyData(await kvGet(saved)); backend.password = saved; setSyncStatus('云端同步：已连接'); return; }
        catch (e) { /* 记住的密码已失效，重新输入 */ }
      }
      lockMode = 'server'; applyLockUI(); showLock();
      var pw = await waitUnlock();
      backend.password = pw;
      applyData(await kvGet(pw));
      setSyncStatus('云端同步：已连接');
      return;
    }
    if (r.ok) {
      backend.mode = 'kv';
      applyData(await r.json());
      setSyncStatus('云端同步：已连接');
      return;
    }
    /* 其它状态（404 等）视为无后端，降级为本地存储 */
  } catch (e) {}
  /* ---------- 本地模式：可选本地访问密码 ---------- */
  backend.mode = 'local';
  var lockHash = null;
  try { lockHash = localStorage.getItem(LS_LOCK); } catch (e) {}
  if (lockHash) {
    lockMode = 'local'; applyLockUI();
    var rem = null; try { rem = localStorage.getItem(LS_PW); } catch (e) {}
    if (rem) {
      var rh = await sha256Hex(rem + LOCK_SALT);
      if (rh === lockHash) { state.groups = loadData(); setSyncStatus('本地存储（已加密）'); return; }
      try { localStorage.removeItem(LS_PW); } catch (e) {}
    }
    showLock();
    await waitUnlock();
    state.groups = loadData();
    setSyncStatus('本地存储（已加密）');
  } else {
    var skip = false; try { skip = localStorage.getItem(LS_LOCK_SKIP) === '1'; } catch (e) {}
    if (skip) {
      state.groups = loadData();
      setSyncStatus('本地存储');
    } else {
      lockMode = 'setup'; lockAllowSkip = true; applyLockUI(); showLock();
      var res = await waitUnlock();   // res = 密码（已设置）或 null（已跳过）
      state.groups = loadData();
      setSyncStatus(res ? '本地存储（已加密）' : '本地存储');
    }
  }
}

/* ---------- 主题 ---------- */
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  $('iconMoon').style.display = t === 'dark' ? 'block' : 'none';
  $('iconSun').style.display = t === 'dark' ? 'none' : 'block';
  try { localStorage.setItem(LS_THEME, t); } catch (e) {}
}

/* ---------- 引擎选择 ---------- */
function renderEngines() {
  var wrap = $('engineRow');
  wrap.innerHTML = '';
  var engines = getEngines();
  engines.forEach(function (en) {
    var label = el('label', null, '');
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = en.id || en.name;
    if (state.engines.has(cb.value)) cb.checked = true;
    if (en.id === DEFAULT_ENGINE) label.classList.add('engine-default');
    label.appendChild(cb);
    label.appendChild(document.createTextNode(en.name));
    wrap.appendChild(label);
  });
  var edit = el('button', 'engine-edit', '编辑引擎');
  edit.addEventListener('click', function () { openEngineModal(); });
  wrap.appendChild(edit);
  wrap.addEventListener('change', function (e) {
    if (e.target && e.target.type === 'checkbox') {
      if (e.target.checked) state.engines.add(e.target.value);
      else state.engines.delete(e.target.value);
      try { localStorage.setItem(LS_ENGINE, JSON.stringify(Array.from(state.engines))); } catch (er) {}
    }
  });
}

/* 引擎管理弹窗 */
function openEngineModal() {
  renderEngineList();
  $('enName').value = ''; $('enUrl').value = '';
  $('engineModal').classList.remove('hidden');
}
function renderEngineList() {
  var list = $('engineList');
  list.innerHTML = '';
  getEngines().forEach(function (en) {
    var row = el('div', 'engine-item', '');
    var nm = el('span', 'nm', escapeHtml(en.name) + ' <span class="muted-url">' + escapeHtml(en.url) + '</span>');
    var del = el('button', 'del', '删除');
    del.addEventListener('click', function () {
      if (!confirm('删除搜索引擎「' + en.name + '」？')) return;
      saveCustomEngines(getEngines().filter(function (x) { return x !== en; }));
      state.engines.delete(en.id || en.name);
      renderEngineList(); renderEngines();
    });
    row.appendChild(nm); row.appendChild(del);
    list.appendChild(row);
  });
}
$('enAdd').addEventListener('click', function () {
  var name = $('enName').value.trim();
  var url = $('enUrl').value.trim();
  if (!name || !url) { toast('请填写名称与搜索地址'); return; }
  saveCustomEngines(getEngines().concat([{ id: 'custom', name: name, url: url }]));
  $('enName').value = ''; $('enUrl').value = '';
  renderEngineList(); renderEngines();
  toast('已添加引擎');
});
$('enReset').addEventListener('click', function () {
  if (!confirm('恢复默认搜索引擎列表？')) return;
  try { localStorage.removeItem(ENGINE_CUSTOM_KEY); } catch (e) {}
  renderEngineList(); renderEngines();
  toast('已恢复默认');
});
$('enClose').addEventListener('click', function () { $('engineModal').classList.add('hidden'); });
$('engineModal').addEventListener('click', function (e) { if (e.target === this) this.classList.add('hidden'); });

/* ---------- 分类树 ---------- */
function renderTree() {
  var wrap = $('groupTree');
  wrap.innerHTML = '';
  var allItem = el('div', 'tree-item' + (state.activeGroup === null ? ' active' : ''), '');
  allItem.innerHTML = '<span>全部站点</span><span class="count">' + totalItems() + '</span>';
  allItem.addEventListener('click', function () { selectGroup(null); });
  allItem.draggable = false;
  wrap.appendChild(allItem);

  state.groups.forEach(function (g, gi) {
    var it = el('div', 'tree-item' + (state.activeGroup === gi ? ' active' : ''));
    it.draggable = true;
    it.setAttribute('data-gi', gi);
    var pin = g.pinned ? '<span class="tree-pin">固定</span>' : '';
    it.innerHTML = '<span class="drag-handle">::</span><span>' + escapeHtml(g.title) + '</span>' + pin +
      '<span class="count">' + (g.items ? g.items.length : 0) + '</span>';
    it.addEventListener('click', function (e) {
      if (e.target.classList.contains('drag-handle')) return;
      selectGroup(gi);
    });
    it.addEventListener('contextmenu', function (e) {
      e.preventDefault(); e.stopPropagation();
      openGroupMenu(e.clientX, e.clientY, gi);
    });
    bindGroupDrag(it);
    wrap.appendChild(it);
  });
}

function totalItems() {
  var n = 0;
  state.groups.forEach(function (g) { n += (g.items ? g.items.length : 0); });
  return n;
}

function selectGroup(gi) {
  state.activeGroup = gi;
  renderTree();
  renderContent();
  if (window.innerWidth <= 760) $('sidebar').classList.add('mobile-hide');
}

/* ---------- 卡片渲染 ---------- */
function renderContent() {
  var grid = $('cardGrid');
  var head = $('groupHead');
  var empty = $('emptyTip');
  grid.innerHTML = '';
  head.innerHTML = '';
  empty.style.display = 'none';

  var groups = state.activeGroup === null
    ? state.groups
    : (state.groups[state.activeGroup] ? [state.groups[state.activeGroup]] : []);

  if (!groups.length) { empty.style.display = 'block'; return; }

  var q = state.query.trim().toLowerCase();
  var sections = [];
  groups.forEach(function (g, idx) {
    var gi = state.activeGroup === null ? state.groups.indexOf(g) : state.activeGroup;
    var items = (g.items || []).map(function (it, ii) { return { it: it, gi: gi, ii: ii }; });
    if (q) {
      items = items.filter(function (o) {
        var it = o.it;
        return (it.title || '').toLowerCase().indexOf(q) >= 0 ||
               (it.description || '').toLowerCase().indexOf(q) >= 0 ||
               (it.url || '').toLowerCase().indexOf(q) >= 0 ||
               (it.lanUrl || '').toLowerCase().indexOf(q) >= 0;
      });
    }
    sections.push({ g: g, gi: gi, items: items });
  });

  var matched = 0;
  sections.forEach(function (sec) {
    if (!sec.items.length) return;
    matched += sec.items.length;
    var secEl = el('section', 'group-section');
    if (state.activeGroup === null) secEl.style.contentVisibility = 'auto';
    var h = el('div', 'group-head', '');
    var pin = sec.g.pinned ? '<span class="pin">固定</span>' : '';
    h.appendChild(el('h2', null, escapeHtml(sec.g.title) + pin));
    var act = el('div', 'group-actions', '');
    var addBtn = el('button', 'btn ghost small', '+ 添加站点');
    addBtn.addEventListener('click', function () { openItemModal('add', sec.gi, -1); });
    act.appendChild(addBtn);
    h.appendChild(act);
    secEl.appendChild(h);

    var cg = el('div', 'card-grid', '');
    sec.items.forEach(function (o) {
      var card = buildCard(o.it, o.gi, o.ii);
      cg.appendChild(card);
    });
    secEl.appendChild(cg);
    grid.appendChild(secEl);
  });

  // 分组标题统一由各 section 自带（.group-head），此处不再重复渲染，避免出现双标题

  if (!matched) empty.style.display = 'block';
  renderStat();
  renderWidgets();
}

function renderStat() {
  $('statCount').textContent = totalItems() + ' 个站点';
}

function buildCard(item, gi, ii) {
  if (item.widget) return buildWidget(item);
  var card = el('div', 'card');
  card.draggable = true;
  card.setAttribute('data-gi', gi);
  card.setAttribute('data-ii', ii);

  var logo = el('div', 'card-logo', '');
  var lg = item.logo || faviconFor(item.url);
  if (lg) {
    var img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.onerror = function () {
      this.style.display = 'none';
      var fb = el('span', 'fallback', escapeHtml((item.title || '?').trim().charAt(0)));
      logo.appendChild(fb);
    };
    img.src = lg;
    logo.appendChild(img);
  } else {
    logo.appendChild(el('span', 'fallback', escapeHtml((item.title || '?').trim().charAt(0))));
  }

  var body = el('div', 'card-body', '');
  body.appendChild(el('div', 'name', escapeHtml(item.title)));
  if (item.description) body.appendChild(el('div', 'desc', escapeHtml(item.description)));

  card.appendChild(logo);
  card.appendChild(body);
  card.appendChild(el('span', 'drag-grip', '::'));

  card.addEventListener('click', function () {
    if (item.url) window.open(item.url, '_blank', 'noopener');
  });
  card.addEventListener('contextmenu', function (e) {
    e.preventDefault(); e.stopPropagation();
    openItemMenu(e.clientX, e.clientY, gi, ii);
  });
  bindCardDrag(card);
  return card;
}

/* ---------- 右键菜单 ---------- */
var menu = $('ctxMenu');
var menuCtx = null; // {type:'item',gi,ii} | {type:'group',gi}

function openItemMenu(x, y, gi, ii) {
  menuCtx = { type: 'item', gi: gi, ii: ii };
  var it = state.groups[gi].items[ii];
  var items = [
    { label: '打开外网链接', fn: function () { if (it.url) window.open(it.url, '_blank', 'noopener'); } },
    { label: '打开内网链接' + (it.lanUrl ? '' : '（未设置）'), disabled: !it.lanUrl,
      fn: function () { if (it.lanUrl) window.open(it.lanUrl, '_blank', 'noopener'); } }
  ];
  if (it.widget) {
    items.push({ sep: true });
    items.push({ label: '编辑/删除', fn: function () { openItemModal('edit', gi, ii); } });
  } else {
    var arr = state.groups[gi].items;
    items.push({ sep: true });
    items.push({ label: '上移', disabled: ii === 0,
      fn: function () { moveItemUpDown(gi, ii, -1); } });
    items.push({ label: '下移', disabled: ii === arr.length - 1,
      fn: function () { moveItemUpDown(gi, ii, 1); } });
    items.push({ sep: true });
    items.push({ label: '编辑标签', fn: function () { openItemModal('edit', gi, ii); } });
    items.push({ label: '删除标签', danger: true, fn: function () { removeItem(gi, ii); } });
  }
  showMenu(x, y, items);
}
function moveItemUpDown(gi, ii, dir) {
  var arr = state.groups[gi].items;
  var to = ii + dir;
  if (to < 0 || to >= arr.length) return;
  var it = arr.splice(ii, 1)[0];
  arr.splice(to, 0, it);
  saveData(); renderTree(); renderContent();
}

function openGroupMenu(x, y, gi) {
  menuCtx = { type: 'group', gi: gi };
  var g = state.groups[gi];
  var items = [
    { label: '重命名分类', fn: function () { openGroupModal('edit', gi); } },
    { label: '添加站点', fn: function () { openItemModal('add', gi, -1); } },
    { sep: true },
    { label: '上移', disabled: gi === 0, fn: function () { moveGroupUpDown(gi, -1); } },
    { label: '下移', disabled: gi === state.groups.length - 1, fn: function () { moveGroupUpDown(gi, 1); } },
    { sep: true },
    { label: '删除分类' + (g.pinned ? '（固定）' : ''), danger: true, fn: function () { removeGroup(gi); } }
  ];
  showMenu(x, y, items);
}
function moveGroupUpDown(gi, dir) {
  var to = gi + dir;
  if (to < 0 || to >= state.groups.length) return;
  var g = state.groups.splice(gi, 1)[0];
  state.groups.splice(to, 0, g);
  if (state.activeGroup === gi) state.activeGroup = to;
  else if (state.activeGroup !== null && state.activeGroup > gi && state.activeGroup <= to) state.activeGroup--;
  saveData(); renderTree(); renderContent();
}

function showMenu(x, y, items) {
  menu.innerHTML = '';
  items.forEach(function (it) {
    if (it.sep) { menu.appendChild(el('div', 'ctx-sep')); return; }
    var d = el('div', 'ctx-item' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : ''), it.label);
    d.addEventListener('click', function () {
      hideMenu();
      if (!it.disabled) it.fn();
    });
    menu.appendChild(d);
  });
  menu.classList.remove('hidden');
  var r = menu.getBoundingClientRect();
  var vw = window.innerWidth, vh = window.innerHeight;
  menu.style.left = Math.min(x, vw - r.width - 8) + 'px';
  menu.style.top = Math.min(y, vh - r.height - 8) + 'px';
}
function hideMenu() { menu.classList.add('hidden'); menuCtx = null; }
document.addEventListener('click', hideMenu);
document.addEventListener('scroll', hideMenu, true);
window.addEventListener('resize', hideMenu);
window.addEventListener('resize', applyResponsiveSidebar);

/* ---------- 拖拽排序：卡片 ---------- */
var dragCard = null;
function bindCardDrag(card) {
  card.addEventListener('dragstart', function (e) {
    dragCard = { gi: +card.getAttribute('data-gi'), ii: +card.getAttribute('data-ii') };
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', ''); } catch (er) {}
  });
  card.addEventListener('dragend', function () {
    card.classList.remove('dragging');
    document.querySelectorAll('.card.drag-over-top,.card.drag-over-bottom').forEach(function (c) {
      c.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    dragCard = null;
  });
  card.addEventListener('dragover', function (e) {
    if (!dragCard) return;
    e.preventDefault();
    var target = { gi: +card.getAttribute('data-gi'), ii: +card.getAttribute('data-ii') };
    card.classList.remove('drag-over-top', 'drag-over-bottom');
    var r = card.getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) card.classList.add('drag-over-top');
    else card.classList.add('drag-over-bottom');
  });
  card.addEventListener('dragleave', function () {
    card.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  card.addEventListener('drop', function (e) {
    e.preventDefault();
    if (!dragCard) return;
    var target = { gi: +card.getAttribute('data-gi'), ii: +card.getAttribute('data-ii') };
    var r = card.getBoundingClientRect();
    var before = e.clientY < r.top + r.height / 2;
    moveItem(dragCard, target, before);
    card.classList.remove('drag-over-top', 'drag-over-bottom');
    dragCard = null;
  });
}
function moveItem(from, to, before) {
  if (from.gi === to.gi) {
    var arr = state.groups[from.gi].items;
    var it = arr.splice(from.ii, 1)[0];
    var idx = to.ii;
    if (!before && idx > from.ii) idx--;
    arr.splice(idx, 0, it);
  } else {
    var fromArr = state.groups[from.gi].items;
    var toArr = state.groups[to.gi].items;
    var it2 = fromArr.splice(from.ii, 1)[0];
    toArr.splice(before ? to.ii : to.ii + 1, 0, it2);
  }
  saveData(); renderTree(); renderContent();
}

/* ---------- 拖拽排序：分类 ---------- */
var dragGroup = null;
function bindGroupDrag(it) {
  it.addEventListener('dragstart', function (e) {
    dragGroup = +it.getAttribute('data-gi');
    it.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', ''); } catch (er) {}
  });
  it.addEventListener('dragend', function () {
    it.classList.remove('dragging');
    document.querySelectorAll('.tree-item.drag-over').forEach(function (c) { c.classList.remove('drag-over'); });
    dragGroup = null;
  });
  it.addEventListener('dragover', function (e) {
    if (dragGroup == null) return;
    e.preventDefault();
    document.querySelectorAll('.tree-item.drag-over').forEach(function (c) { c.classList.remove('drag-over'); });
    it.classList.add('drag-over');
  });
  it.addEventListener('dragleave', function () { it.classList.remove('drag-over'); });
  it.addEventListener('drop', function (e) {
    e.preventDefault();
    if (dragGroup == null) return;
    var target = +it.getAttribute('data-gi');
    if (dragGroup !== target) {
      var arr = state.groups;
      var g = arr.splice(dragGroup, 1)[0];
      arr.splice(target, 0, g);
      if (state.activeGroup === dragGroup) state.activeGroup = target;
      else if (state.activeGroup !== null && state.activeGroup > dragGroup && state.activeGroup <= target) state.activeGroup--;
      saveData(); renderTree(); renderContent();
    }
    document.querySelectorAll('.tree-item.drag-over').forEach(function (c) { c.classList.remove('drag-over'); });
    dragGroup = null;
  });
}

/* ---------- 增删改 ---------- */
function removeItem(gi, ii) {
  if (!confirm('确定删除「' + state.groups[gi].items[ii].title + '」？')) return;
  state.groups[gi].items.splice(ii, 1);
  saveData(); renderTree(); renderContent();
}
function removeGroup(gi) {
  var g = state.groups[gi];
  if (!confirm('确定删除分类「' + g.title + '」及其全部站点？')) return;
  state.groups.splice(gi, 1);
  if (state.activeGroup === gi) state.activeGroup = null;
  else if (state.activeGroup !== null && state.activeGroup > gi) state.activeGroup--;
  saveData(); renderTree(); renderContent();
}

/* ---------- 弹窗：站点 ---------- */
var modalMode = 'add';
var modalRef = { gi: -1, ii: -1 };

/* 填充"所属分组"下拉列表，selGi 为当前选中分组索引 */
function fillGroupSelect(selGi) {
  var sel = $('fGroup');
  sel.innerHTML = '';
  state.groups.forEach(function (g, i) {
    var op = document.createElement('option');
    op.value = String(i);
    op.textContent = (g && g.title) ? g.title : ('分组 ' + (i + 1));
    if (i === selGi) op.selected = true;
    sel.appendChild(op);
  });
}

function openItemModal(mode, gi, ii) {
  modalMode = mode; modalRef = { gi: gi, ii: ii };
  $('modalTitle').textContent = mode === 'add' ? '添加站点' : '编辑标签';
  $('fTitle').value = ''; $('fUrl').value = ''; $('fLan').value = '';
  $('fDesc').value = ''; $('fLogo').value = '';
  if (mode === 'edit') {
    var it = state.groups[gi].items[ii];
    $('fTitle').value = it.title || '';
    $('fUrl').value = it.url || '';
    $('fLan').value = it.lanUrl || '';
    $('fDesc').value = it.description || '';
    $('fLogo').value = it.logo || '';
  }
  fillGroupSelect(gi);
  $('fGroupField').classList.remove('hidden');
  resetAutoMetaState();
  $('modal').classList.remove('hidden');
  $('fTitle').focus();
}
function closeModal() {
  var m = $('modal'); if (m) m.classList.add('hidden');
  var im = $('importModal'); if (im) im.classList.add('hidden');
  var mp = $('managePanel'); if (mp) mp.classList.add('hidden');
}
$('modalCancel').addEventListener('click', closeModal);
$('modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
/* 自动获取按钮 + 手动编辑时移除自动标记（测试版 v1.4.0-test.1） */
(function bindAutoMeta() {
  var btn = $('btnAutoMeta');
  if (btn) btn.addEventListener('click', autoFetchMeta);
  ['fTitle', 'fDesc', 'fLogo', 'fUrl'].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener('input', function () { el.classList.remove('autofilled'); });
  });
})();

/* ---------- 弹窗：分类 ---------- */
var groupModalMode = 'add';
var groupModalRef = -1;
function openGroupModal(mode, gi) {
  modalMode = 'group';
  groupModalMode = mode; groupModalRef = gi;
  $('modalTitle').textContent = mode === 'add' ? '添加分类' : '重命名分类';
  $('fTitle').value = mode === 'edit' ? (state.groups[gi].title || '') : '';
  $('fUrl').value = ''; $('fLan').value = ''; $('fDesc').value = ''; $('fLogo').value = '';
  $('fGroupField').classList.add('hidden');   // 分类弹窗不显示分组选择
  $('modal').classList.remove('hidden');
  $('fTitle').focus();
}
$('addGroupBtn').addEventListener('click', function () { openGroupModal('add', -1); });

/* 表单提交分流 */
var baseSubmit = $('modalForm').onsubmit;
$('modalForm').onsubmit = function (e) {
  e.preventDefault();
  var title = $('fTitle').value.trim();
  if (!title) { toast('请填写名称'); return; }
  if (modalMode === 'group') {
    if (groupModalMode === 'add') {
      state.groups.push({ title: title, items: [] });
      toast('已添加分类');
    } else {
      state.groups[groupModalRef].title = title;
      toast('已重命名');
    }
    saveData(); renderTree(); renderContent();
    closeModal();
    return;
  }
  // item 流程
  var data = {
    title: title,
    url: $('fUrl').value.trim(),
    lanUrl: $('fLan').value.trim(),
    description: $('fDesc').value.trim(),
    logo: $('fLogo').value.trim()
  };
  // 目标分组（可在弹窗中切换到其它分组）
  var targetGi = parseInt($('fGroup').value, 10);
  if (isNaN(targetGi) || !state.groups[targetGi]) targetGi = modalRef.gi;
  if (!state.groups[targetGi].items) state.groups[targetGi].items = [];

  if (modalMode === 'add') {
    state.groups[targetGi].items.push(data);
    toast(targetGi === modalRef.gi ? '已添加' : '已添加到「' + state.groups[targetGi].title + '」');
  } else {
    var it = state.groups[modalRef.gi].items[modalRef.ii];
    it.title = data.title; it.url = data.url; it.lanUrl = data.lanUrl;
    it.description = data.description; it.logo = data.logo;
    if (targetGi !== modalRef.gi) {
      state.groups[modalRef.gi].items.splice(modalRef.ii, 1);
      state.groups[targetGi].items.push(it);
      toast('已移动到「' + state.groups[targetGi].title + '」');
    } else {
      toast('已保存');
    }
  }
  saveData(); renderTree(); renderContent();
  closeModal();
};

/* ---------- 导出 / 导入 / 重置 ---------- */
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function fmtDate(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
    ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}
/* 转成 Sun-Panel 备份格式（可平移到 sun-panel） */
function toSunPanel(groups) {
  return {
    version: 1,
    appName: 'Sun-Panel-Config',
    exportTime: fmtDate(new Date()),
    appVersion: '1.8.1',
    md5: '',
    icons: groups.map(function (g, gi) {
      return {
        title: g.title,
        sort: gi + 1,
        children: (g.items || []).filter(function (it) { return !it.widget; }).map(function (it, j) {
          return {
            icon: { itemType: 2, src: it.logo || '', text: '', backgroundColor: '' },
            sort: j + 1,
            title: it.title || '',
            url: it.url || '',
            lanUrl: it.lanUrl || '',
            description: it.description || '',
            openMethod: 2,
            cardType: 0,
            backgroundColor: '',
            expandParam: null
          };
        })
      };
    })
  };
}
/* 归一化导入数据：兼容本应用格式与 Sun-Panel 备份格式 */
function normalizeImport(data) {
  var groups = Array.isArray(data) ? data : (data && Array.isArray(data.icons) ? data.icons : null);
  if (!groups) throw new Error('无法识别的 JSON 格式');
  return groups.map(function (g) {
    return {
      title: (g.title || '').trim() || '未命名分类',
      pinned: !!g.pinned,
      items: (g.items || g.children || []).map(function (it) {
        // 兼容 Sun-Panel v2：url/lanUrl/icon 被包进 cardData 内
        var cd = it.cardData || {};
        var ic = it.icon || cd.icon || {};
        return {
          title: (it.title || '').trim(),
          url: (cd.url || it.url || '').trim(),
          lanUrl: (cd.lanUrl || it.lanUrl || '').trim(),
          description: (it.description || it.desc || cd.description || cd.desc || '').trim(),
          logo: (it.logo || ic.src || '').trim()
        };
      }).filter(function (it) { return it.title; })
    };
  }).filter(function (g) { return g.items.length > 0; });
}
function downloadFile(filename, text, mime) {
  try {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
    return true;
  } catch (e) { return false; }
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
  }
  return Promise.resolve(false);
}
function doExport(filename, text, mime) {
  var dlOk = downloadFile(filename, text, mime);
  copyText(text).then(function (copied) {
    if (dlOk && copied) toast('已导出文件，内容也已复制到剪贴板');
    else if (dlOk) toast('已导出文件，如未自动下载请查看浏览器下载记录');
    else if (copied) toast('未自动下载文件，内容已复制到剪贴板，请粘贴保存为 ' + filename);
    else toast('导出失败：浏览器不支持，请使用电脑端导出');
  });
}
function escAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/* 生成浏览器书签 HTML（Netscape 格式，Chrome/Edge/Firefox 可导入） */
function toBookmarksHtml(groups) {
  var L = [];
  L.push('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
  L.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">');
  L.push('<TITLE>Sun Nav Bookmarks</TITLE>');
  L.push('<H1>Sun Nav Bookmarks</H1>');
  L.push('<DL><p>');
  groups.forEach(function (g) {
    var items = (g.items || []).filter(function (it) { return !it.widget; });
    L.push('    <DT><H3>' + escAttr(g.title) + '</H3>');
    L.push('    <DL><p>');
    items.forEach(function (it) {
      // 一个标签可能同时有外网(url)与内网(lanUrl)两个地址，拆成多条超链接，
      // 以「标题（外网）」「标题（内网）」区分，避免通用 HTML 导出丢失地址
      if (it.url) L.push('        <DT><A HREF="' + escAttr(it.url) + '">' + escAttr((it.title || '') + '（外网）') + '</A>');
      if (it.lanUrl) L.push('        <DT><A HREF="' + escAttr(it.lanUrl) + '">' + escAttr((it.title || '') + '（内网）') + '</A>');
      if (!it.url && !it.lanUrl) L.push('        <DT><A HREF="">' + escAttr(it.title || '') + '</A>');
    });
    L.push('    </DL><p>');
  });
  L.push('</DL><p>');
  return L.join('\n');
}
/* 管理面板：把导入/导出/重置收进「管理」按钮展开区（仿引擎） */
function hideManage() { var p = $('managePanel'); if (p) p.classList.add('hidden'); }
$('manageBtn').addEventListener('click', function (e) {
  e.stopPropagation();
  $('managePanel').classList.toggle('hidden');
  if (!$('managePanel').classList.contains('hidden')) refreshLocalPwState();
});
document.addEventListener('click', function (e) {
  var p = $('managePanel');
  if (p && !p.classList.contains('hidden') &&
      !p.contains(e.target) && e.target !== $('manageBtn') && !$('manageBtn').contains(e.target)) {
    p.classList.add('hidden');
  }
});
$('manageExpJson').addEventListener('click', function () {
  var fname = 'SunNav-Data' + fmtDate(new Date()).replace(/[-: ]/g, '') + '.SunPanel.json';
  doExport(fname, JSON.stringify(toSunPanel(state.groups), null, 2), 'application/json');
});
$('manageExpHtml').addEventListener('click', function () {
  var fname = 'bookmarks-' + fmtDate(new Date()).replace(/[-: ]/g, '') + '.html';
  doExport(fname, toBookmarksHtml(state.groups), 'text/html');
});
function dedupKey(it) { return ((it.title || '').trim().toLowerCase() + '||' + (it.url || '').trim().toLowerCase()); }
/* 合并去重：同名分类并入现有，同名同链接自动排除 */
function mergeGroups(existing, incoming) {
  var out = deepClone(existing);
  incoming.forEach(function (ig) {
    var match = null;
    for (var i = 0; i < out.length; i++) if (out[i].title === ig.title) { match = out[i]; break; }
    if (match) {
      var keys = {};
      match.items.forEach(function (it) { keys[dedupKey(it)] = it; });
      ig.items.forEach(function (it) {
        var key = dedupKey(it);
        if (keys[key]) {
          // 同名同链接：补全省缺字段（如内网地址 lanUrl），避免合并时丢失数据
          var ex = keys[key];
          ['url', 'lanUrl', 'description', 'logo'].forEach(function (f) {
            if (!ex[f] && it[f]) ex[f] = it[f];
          });
        } else {
          match.items.push(it);
          keys[key] = it;
        }
      });
    } else {
      out.push(ig);
    }
  });
  return out;
}
/* 仅追加：备份作为新分类整体加入，不去重；同名分类加后缀区分 */
function appendGroups(incoming, existing) {
  var titles = {};
  existing.forEach(function (g) { titles[g.title] = 1; });
  return incoming.map(function (g) {
    if (titles[g.title]) {
      var t = g.title + '（导入）';
      titles[t] = 1;
      return { title: t, pinned: false, items: g.items };
    }
    titles[g.title] = 1;
    return g;
  });
}
function currentMode() {
  var modeEl = document.querySelector('input[name=impMode]:checked');
  return modeEl ? modeEl.value : 'replace';
}
/* 解析浏览器书签 HTML（Netscape 格式） */
function parseBookmarkDl(dl, groups, parent) {
  var cur = parent;
  if (!cur) { cur = { title: '书签', items: [] }; groups.push(cur); }
  for (var i = 0; i < dl.children.length; i++) {
    var e = dl.children[i];
    if (e.tagName !== 'DT') continue;
    var h3 = e.querySelector('h3');
    if (h3) {
      var dl2 = e.nextElementSibling;
      if (dl2 && dl2.tagName === 'DL') {
        var g = { title: (h3.textContent || '').trim() || '未命名', items: [] };
        groups.push(g);
        parseBookmarkDl(dl2, groups, g);
      }
      continue;
    }
    var a = e.querySelector('a[href]');
    if (a) {
      var url = a.getAttribute('href') || '';
      if (!url) continue;
      var raw = (a.textContent || '').trim() || url;
      // 识别「标题（外网）」/「标题（内网）」后缀，合并为同一标签的多个地址
      var mm = raw.match(/^(.*?)\s*[（(](外网|内网)[)）]\s*$/);
      var baseTitle, field;
      if (mm) { baseTitle = mm[1].trim(); field = (mm[2] === '内网') ? 'lanUrl' : 'url'; }
      else { baseTitle = raw; field = 'url'; }
      var exist = null;
      for (var k = 0; k < cur.items.length; k++) {
        if (cur.items[k].title === baseTitle) { exist = cur.items[k]; break; }
      }
      if (exist) {
        if (!exist[field]) exist[field] = url;
        else if (!exist.url) exist.url = url;
      } else {
        var nb = { title: baseTitle, url: '', lanUrl: '', description: '', logo: '' };
        nb[field] = url;
        cur.items.push(nb);
      }
    }
  }
}
function parseBookmarksHtml(htmlText) {
  var doc = new DOMParser().parseFromString(htmlText, 'text/html');
  var root = doc.querySelector('dl');
  if (!root) throw new Error('未找到书签结构');
  var groups = [];
  parseBookmarkDl(root, groups, null);
  return groups.filter(function (g) { return g.items.length > 0; });
}
/* 自动识别导入来源：JSON（本应用/Sun-Panel）或浏览器书签 HTML */
function parseAnyImport(text) {
  var s = text.trim();
  if (s.charAt(0) === '{' || s.charAt(0) === '[') {
    return normalizeImport(JSON.parse(text));
  }
  if (/NETSCAPE-Bookmark|<dl[^>]*>|<a [^>]*href/i.test(s)) {
    return parseBookmarksHtml(text);
  }
  throw new Error('无法识别的格式（需 JSON 或浏览器书签 HTML）');
}
function doImport(text) {
  var mode = currentMode();
  var incoming = parseAnyImport(text);
  if (!incoming.length) throw new Error('没有可导入的站点');
  if (mode === 'replace') {
    if (!confirm('覆盖导入将清空当前全部站点并替换为备份内容，确定？')) { closeModal(); return; }
    state.groups = incoming;
  } else if (mode === 'merge') {
    state.groups = mergeGroups(state.groups, incoming);
  } else {
    state.groups = state.groups.concat(appendGroups(incoming, state.groups));
  }
  saveData(); renderTree(); renderContent();
  toast(mode === 'replace' ? '已覆盖导入' : mode === 'merge' ? '已合并去重导入' : '已追加导入');
  closeModal();
}
function runFileImport(file) {
  if (!file) { toast('请选择文件'); return; }
  // 直接上传 Sun-Panel 等导出的 .zip 备份，自动解压后读取内部 config.json
  if (/\.zip$/i.test(file.name || '')) { importZip(file); return; }
  var reader = new FileReader();
  reader.onload = function (e) {
    try { doImport(e.target.result); }
    catch (er) { toast('导入失败：' + er.message); }
  };
  reader.readAsText(file);
}
$('manageImport').addEventListener('click', function () { runFileImport($('manageFile').files[0]); });
/* 解压 zip 备份（如 Sun-Panel 导出的 config.json 压缩包），自动定位内部 JSON 后交给 doImport */
function importZip(file) {
  if (typeof JSZip === 'undefined') {
    toast('解压组件未加载，请改用已解压的 JSON 文件导入');
    return;
  }
  JSZip.loadAsync(file).then(function (zip) {
    var names = Object.keys(zip.files);
    var target = null;
    // 优先找 config.json（兼容嵌套子目录），否则取第一个 .json
    for (var i = 0; i < names.length; i++) {
      if (!zip.files[names[i]].dir &&
          names[i].toLowerCase().split('/').pop() === 'config.json') { target = names[i]; break; }
    }
    if (!target) {
      for (var j = 0; j < names.length; j++) {
        if (!zip.files[names[j]].dir && /\.json$/i.test(names[j])) { target = names[j]; break; }
      }
    }
    if (!target) throw new Error('压缩包内未找到 JSON 配置文件');
    return zip.file(target).async('string').then(function (text) { doImport(text); });
  }).catch(function (err) {
    toast('zip 导入失败：' + (err && err.message ? err.message : '文件可能已损坏'));
  });
}
/* 从剪贴板导入（移动端文件选择器不可用时兜底） */
function runPasteImport() {
  if (!navigator.clipboard || !navigator.clipboard.readText) { toast('当前浏览器不支持读取剪贴板'); return; }
  navigator.clipboard.readText().then(function (text) {
    if (!text || !text.trim()) { toast('剪贴板为空'); return; }
    try { doImport(text); }
    catch (er) { toast('导入失败：剪贴板内容不是有效配置：' + er.message); }
  }, function () { toast('读取剪贴板失败，请检查浏览器权限'); });
}
$('managePaste').addEventListener('click', runPasteImport);
/* 重置数据：仅保留「功能工具」一个分组，其它分组与标签全部清空；
   但「功能工具」内用户自己添加的标签会保留，只补足默认组件（IP监测/日历时钟） */
function buildResetData() {
  var tool = null, i;
  // 优先保留用户现有的「功能工具」分组（含其自定义标签），避免重置时清掉用户内容
  for (i = 0; i < state.groups.length; i++) {
    if (state.groups[i] && state.groups[i].title === TOOL_GROUP_TITLE) { tool = deepClone(state.groups[i]); break; }
  }
  // 若当前数据中没有「功能工具」，再从默认数据取
  if (!tool) {
    var def = deepClone(window.SUN_PANEL_DATA || []);
    for (i = 0; i < def.length; i++) {
      if (def[i] && def[i].title === TOOL_GROUP_TITLE) { tool = def[i]; break; }
    }
  }
  if (!tool) tool = { title: TOOL_GROUP_TITLE, pinned: true, items: [] };
  if (!tool.items) tool.items = [];
  tool.pinned = true;

  function hasWidget(w) {
    for (var k = 0; k < tool.items.length; k++) if (tool.items[k].widget === w) return true;
    return false;
  }
  if (!hasWidget('ipmonitor')) {
    tool.items.unshift({ widget: 'ipmonitor', title: 'IP 与连通性测试', description: '实时检测本机公网 IP 与主要站点连通性，自动刷新' });
  }
  if (!hasWidget('calclock')) {
    var pos = 0;
    for (var j = 0; j < tool.items.length; j++) if (tool.items[j].widget === 'ipmonitor') pos = j + 1;
    tool.items.splice(pos, 0, { widget: 'calclock', title: '日历与时钟', description: '当前日期与实时时间' });
  }
  return [tool];
}
function doReset() {
  if (!confirm('确定重置？将只保留「' + TOOL_GROUP_TITLE + '」一个分组，其它所有分组和标签都会被清空。')) return;
  state.groups = buildResetData();
  state.activeGroup = null;
  state.query = '';
  $('searchInput').value = '';
  saveData(); renderTree(); renderContent();
  toast('已重置：仅保留「' + TOOL_GROUP_TITLE + '」');
}
$('manageReset').addEventListener('click', doReset);
/* 密码锁：按 lockMode 分支处理（Cloudflare 后端密码 / 本地锁 / 首次设置） */
$('lockSubmit').addEventListener('click', async function () {
  var pw = $('lockPass').value;
  if (lockMode === 'setup') {
    if (!pw) { $('lockErr').textContent = '请输入密码'; return; }
    if (pw.length < 4) { $('lockErr').textContent = '密码至少 4 位'; return; }
    if (pw !== $('lockPass2').value) { $('lockErr').textContent = '两次输入的密码不一致'; return; }
    var h = await sha256Hex(pw + LOCK_SALT);
    try { localStorage.setItem(LS_LOCK, h); } catch (e) {}
    hideLock();
    if (unlockResolve) { var r = unlockResolve; unlockResolve = null; r(pw); }
    return;
  }
  if (!pw) { $('lockErr').textContent = '请输入密码'; return; }
  if (lockMode === 'local') {
    var stored = null; try { stored = localStorage.getItem(LS_LOCK); } catch (e) {}
    if (await sha256Hex(pw + LOCK_SALT) !== stored) { $('lockErr').textContent = '密码错误'; return; }
    if ($('lockRemember').checked) { try { localStorage.setItem(LS_PW, pw); } catch (e) {} }
    else { try { localStorage.removeItem(LS_PW); } catch (e) {} }
    hideLock();
    if (unlockResolve) { var rl = unlockResolve; unlockResolve = null; rl(pw); }
    return;
  }
  /* server 模式：用 Cloudflare 后端校验 */
  kvGet(pw).then(function () {
    if ($('lockRemember').checked) { try { localStorage.setItem(LS_PW, pw); } catch (e) {} }
    else { try { localStorage.removeItem(LS_PW); } catch (e) {} }
    hideLock();
    if (unlockResolve) { var rs = unlockResolve; unlockResolve = null; rs(pw); }
  }).catch(function (e) { $('lockErr').textContent = e.message; });
});
$('lockSkip').addEventListener('click', function () {
  if (lockAllowSkip) { try { localStorage.setItem(LS_LOCK_SKIP, '1'); } catch (e) {} }
  hideLock();
  if (unlockResolve) { var r = unlockResolve; unlockResolve = null; r(null); }
});
$('lockPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('lockSubmit').click(); });

/* 管理面板：本地访问密码 设置/修改/关闭 */
function refreshLocalPwState() {
  var el = $('localPwState'); if (!el) return;
  var has = false; try { has = !!localStorage.getItem(LS_LOCK); } catch (e) {}
  el.textContent = has ? '当前：已启用本地访问密码' : '当前：未启用（首次打开会提示设置）';
}
$('manageSetPw').addEventListener('click', function () {
  var has = false; try { has = !!localStorage.getItem(LS_LOCK); } catch (e) {}
  lockMode = 'setup';
  lockAllowSkip = !has;          // 已启用过则不允许「跳过」，只能改或取消
  applyLockUI();
  hideManage();
  showLock();
  waitUnlock().then(function () { refreshLocalPwState(); });
});
$('manageDelPw').addEventListener('click', function () {
  try { localStorage.removeItem(LS_LOCK); localStorage.removeItem(LS_PW); } catch (e) {}
  refreshLocalPwState();
  toast('已关闭本地访问密码');
});

/* ---------- 搜索与搜索引擎 ---------- */
/* 被浏览器拦截（仅放行首个弹窗）的引擎，改为可点击链接浮层，保证都能打开 */
function showSearchBlocked(list, q) {
  var box = $('searchLauncher');
  if (!box) {
    box = document.createElement('div');
    box.id = 'searchLauncher';
    box.className = 'search-launcher hidden';
    document.body.appendChild(box);
  }
  box.innerHTML = '';
  var head = document.createElement('div');
  head.className = 'sl-title';
  head.innerHTML = '以下搜索被浏览器拦截，点击逐一打开 <span class="sl-close" title="关闭">×</span>';
  box.appendChild(head);
  list.forEach(function (en) {
    var a = document.createElement('a');
    a.href = engineUrl(en, q);
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'sl-item';
    a.textContent = en.name;
    box.appendChild(a);
  });
  box.classList.remove('hidden');
  head.querySelector('.sl-close').addEventListener('click', function (e) {
    e.stopPropagation();
    box.classList.add('hidden');
  });
}
function runSearch() {
  var q = $('searchInput').value.trim();
  if (!q) { toast('请输入搜索内容'); return; }
  var all = getEngines();
  var engines = all.filter(function (en) { return state.engines.has(en.id || en.name); });
  var targets = engines.length ? engines
    : [all.filter(function (e) { return e.id === DEFAULT_ENGINE; })[0] || all[0]];
  var opened = 0, blocked = [];
  // 逐个打开：浏览器通常只放行首个弹窗，被拦截的引擎收集后改为可点击链接
  targets.forEach(function (en) {
    var w = window.open(engineUrl(en, q), '_blank', 'noopener');
    if (w) opened++; else blocked.push(en);
  });
  // 保持本页焦点
  try { window.focus(); } catch (e) {}
  // 清空搜索框并重置筛选
  $('searchInput').value = '';
  state.query = '';
  renderContent();
  if (blocked.length) showSearchBlocked(blocked, q);
  else if (opened < targets.length) toast('部分搜索页被浏览器拦截，请在地址栏允许本站点弹窗');
}
$('searchBtn').addEventListener('click', runSearch);
$('searchInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { e.preventDefault(); runSearch(); return; }
});
$('searchInput').addEventListener('input', function () {
  state.query = $('searchInput').value;
  renderContent();
});

/* ---------- 引擎收起：页面向下滚动时隐藏，点"引擎"重新展开 ---------- */
var engineExpandAt = 0;
function setEngineHidden(hidden) {
  document.querySelector('.topbar').classList.toggle('engine-hidden', hidden);
  $('engineToggle').classList.toggle('active', !hidden);
}
window.addEventListener('scroll', function () {
  if (window.scrollY > 60 && Date.now() - engineExpandAt > 2000) setEngineHidden(true);
}, { passive: true });
$('engineToggle').addEventListener('click', function () {
  var hidden = document.querySelector('.topbar').classList.contains('engine-hidden');
  if (hidden) engineExpandAt = Date.now();
  setEngineHidden(!hidden);
});

/* ---------- 侧栏折叠 / 主题 ---------- */
$('sidebarToggle').addEventListener('click', function () {
  if (window.innerWidth <= 760) $('sidebar').classList.toggle('mobile-hide');
  else $('sidebar').classList.toggle('collapsed');
});
$('sidebarCollapse').addEventListener('click', function () {
  if (window.innerWidth <= 760) $('sidebar').classList.add('mobile-hide');
  else $('sidebar').classList.toggle('collapsed');
});
$('themeToggle').addEventListener('click', function () {
  var cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});

/* ---------- 功能 Widgets ---------- */
var ipTimerStarted = false, clTimerStarted = false;
var ipCache = null;               // 最近一次 IP 信息
var probeCache = {};              // 站点连通性缓存: name -> {status, ms}
function renderWidgets() {
  ensureIpMonitor();
  ensureCalClock();
}
function ensureIpMonitor() {
  if (!document.getElementById('ipmonitor-root')) return;
  if (!ipTimerStarted) {
    ipTimerStarted = true;
    ipProbe();
    setInterval(ipProbe, 30000);
  }
}
function ensureCalClock() {
  if (clTimerStarted) return;
  if (!document.getElementById('calclock-root')) return;
  clTimerStarted = true;
  clTick();
  setInterval(clTick, 1000);
}

var IP_SITES = [
  { name: '百度', url: 'https://www.baidu.com/' },
  { name: 'Google', url: 'https://www.google.com/' },
  { name: 'GitHub', url: 'https://github.com/' },
  { name: 'OpenAI', url: 'https://www.openai.com/' },
  { name: 'Cloudflare', url: 'https://www.cloudflare.com/' },
  { name: 'YouTube', url: 'https://www.youtube.com/' }
];

function buildWidget(item) {
  var card = el('div', 'card widget-card');
  if (item.widget === 'ipmonitor') {
    var ip = ipCache ? ipCache.ip : '检测中…';
    var geo = ipCache ? (ipCache.geo || '-') : '-';
    var isp = ipCache ? (ipCache.isp || '-') : '-';
    var status = ipCache ? ipCache.status : '正在检测主要站点连通性…';
    var netRows = buildProbeRows();
    card.innerHTML =
      '<div class="widget ipmonitor">' +
        '<div class="widget-body">' +
          '<div class="w-title">IP 与连通性测试</div>' +
          '<div class="ipinfo">' +
            '<span><span class="k">IP</span><span class="ip" id="ipmonitor-ip">' + escapeHtml(ip) + '</span></span>' +
            '<span><span class="k">归属</span><span id="ipmonitor-geo">' + escapeHtml(geo) + '</span></span>' +
            '<span><span class="k">ISP</span><span id="ipmonitor-isp">' + escapeHtml(isp) + '</span></span>' +
          '</div>' +
          '<div class="status-line" id="ipmonitor-status">' + escapeHtml(status) + '</div>' +
          '<div class="net" id="ipmonitor-net">' + netRows + '</div>' +
        '</div>' +
      '</div>';
    card.id = 'ipmonitor-root';
  } else if (item.widget === 'calclock') {
    card.innerHTML =
      '<div class="widget calclock">' +
        '<div class="widget-body">' +
          '<div class="clock"><span id="calclock-time">00:00:00</span><span class="sec"></span></div>' +
          '<div class="date" id="calclock-date"></div>' +
          '<div class="calendar" id="calclock-cal"></div>' +
        '</div>' +
      '</div>';
    card.id = 'calclock-root';
  }
  return card;
}
function buildProbeRows() {
  var html = '';
  IP_SITES.forEach(function (s) {
    var c = probeCache[s.name];
    var cls = 'badge';
    var txt = '…';
    if (c) { cls = 'badge ' + (c.ok ? 'ok' : 'fail'); txt = c.ok ? (c.ms + 'ms') : '不可达'; }
    html += '<div class="site"><span class="nm">' + escapeHtml(s.name) + '</span><span class="' + cls + '">' + txt + '</span></div>';
  });
  return html;
}

/* IP 检测 */
function ipProbe() {
  var ipEl = document.getElementById('ipmonitor-ip');
  if (ipEl) ipEl.textContent = '检测中…';
  getIpInfo().then(function (info) {
    ipCache = { ip: info.ip || '-', geo: info.geo || '-', isp: info.isp || '-',
      status: '更新于 ' + new Date().toLocaleTimeString() };
    var ipEl = document.getElementById('ipmonitor-ip');
    var geo = document.getElementById('ipmonitor-geo');
    var isp = document.getElementById('ipmonitor-isp');
    var st = document.getElementById('ipmonitor-status');
    if (ipEl) ipEl.textContent = info.ip || '-';
    if (geo) geo.textContent = info.geo || '-';
    if (isp) isp.textContent = info.isp || '-';
    if (st) st.textContent = ipCache.status;
  }).catch(function () {
    ipCache = { ip: '获取失败', geo: '-', isp: '-', status: 'IP 服务不可用，稍后重试' };
    var ipEl = document.getElementById('ipmonitor-ip');
    var st = document.getElementById('ipmonitor-status');
    if (ipEl) ipEl.textContent = '获取失败';
    if (st) st.textContent = ipCache.status;
  });
  probeSites();
}
function getIpInfo() {
  var apis = [
    function () {
      return fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(6000) })
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (d) { return { ip: d.ip, geo: [d.city, d.region, d.country_name].filter(Boolean).join(' '), isp: d.org }; });
    },
    function () {
      return fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(6000) })
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (d) { return { ip: d.ip, geo: [d.city, d.region, d.country].filter(Boolean).join(' '), isp: d.org }; });
    },
    function () {
      return fetch('https://ip-api.com/json/?lang=zh-CN', { signal: AbortSignal.timeout(6000) })
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (d) { return { ip: d.query, geo: [d.country, d.regionName, d.city].filter(Boolean).join(' '), isp: d.isp || d.org }; });
    }
  ];
  return apis.reduce(function (p, fn) { return p.catch(fn); }, Promise.reject());
}
function probeSites() {
  var net = document.getElementById('ipmonitor-net');
  if (!net) return;
  net.innerHTML = '';
  IP_SITES.forEach(function (s) {
    var row = el('div', 'site', '');
    row.innerHTML = '<span class="nm">' + escapeHtml(s.name) + '</span><span class="badge">…</span>';
    net.appendChild(row);
    var t0 = performance.now();
    fetch(s.url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(5000) })
      .then(function () {
        var ms = Math.round(performance.now() - t0);
        probeCache[s.name] = { ok: true, ms: ms };
        var b = row.querySelector('.badge');
        if (b) { b.className = 'badge ok'; b.textContent = ms + 'ms'; }
      })
      .catch(function () {
        probeCache[s.name] = { ok: false };
        var b = row.querySelector('.badge');
        if (b) { b.className = 'badge fail'; b.textContent = '不可达'; }
      });
  });
}

/* 日历时钟 */
function pad(n) { return n < 10 ? '0' + n : '' + n; }
var clLastDay = null;
function clTick() {
  var now = new Date();
  var h = pad(now.getHours()), m = pad(now.getMinutes()), s = pad(now.getSeconds());
  var t = document.getElementById('calclock-time');
  if (t) t.textContent = h + ':' + m + ':' + s;
  var d = document.getElementById('calclock-date');
  if (d) d.textContent = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 ' +
    '星期' + '日一二三四五六'.charAt(now.getDay());
  var cal = document.getElementById('calclock-cal');
  if (cal && (clLastDay !== now.getDate() || cal.dataset.month != now.getMonth())) {
    renderCalendar(cal, now);
    clLastDay = now.getDate();
  }
}
function renderCalendar(cal, now) {
  cal.dataset.month = now.getMonth();
  var y = now.getFullYear(), m = now.getMonth();
  var startDow = new Date(y, m, 1).getDay();
  var daysInMonth = new Date(y, m + 1, 0).getDate();
  var html = '';
  '日一二三四五六'.split('').forEach(function (w, i) {
    html += '<span class="dow' + (i === 0 || i === 6 ? ' weekend' : '') + '">' + w + '</span>';
  });
  var prevDays = new Date(y, m, 0).getDate();
  for (var i = 0; i < startDow; i++) {
    html += '<span class="day other">' + (prevDays - startDow + i + 1) + '</span>';
  }
  for (var d = 1; d <= daysInMonth; d++) {
    var dow = new Date(y, m, d).getDay();
    var cls = 'day';
    if (dow === 0 || dow === 6) cls += ' weekend';
    if (d === now.getDate()) cls += ' today';
    html += '<span class="' + cls + '">' + d + '</span>';
  }
  cal.innerHTML = html;
}

/* ---------- 初始化 ---------- */
/* 响应式侧边栏：手机版（窄屏）默认关闭菜单减少遮挡，电脑版默认开启 */
function applyResponsiveSidebar() {
  var sb = $('sidebar');
  if (!sb) return;
  if (window.innerWidth <= 760) sb.classList.add('mobile-hide');
  else sb.classList.remove('mobile-hide');
}
async function init() {
  $('appVersion').textContent = APP_VERSION;
  try {
    var t = localStorage.getItem(LS_THEME);
    applyTheme(t === 'light' ? 'light' : 'dark');
  } catch (e) { applyTheme('dark'); }
  try {
    var es = JSON.parse(localStorage.getItem(LS_ENGINE) || '[]');
    if (Array.isArray(es)) es.forEach(function (id) { state.engines.add(id); });
  } catch (e) {}
  renderEngines();
  setEngineHidden(window.innerWidth <= 760);   // 窄屏默认收起引擎选项，节省空间
  applyResponsiveSidebar();                    // 窄屏默认关闭侧边栏菜单，电脑版默认开启
  await bootData();                            // 检测后端：Cloudflare KV 云端 或 本地降级
  renderTree();
  renderContent();
}
document.addEventListener('DOMContentLoaded', init);
})();
