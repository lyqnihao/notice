/* ===== Sun Nav 导航页逻辑 v1.1.5 ===== */
(function () {
'use strict';

/* ---------- 版本号（侧栏底部展示，修改时同步 README / data.js 头部注释） ---------- */
var APP_VERSION = 'v1.1.5';
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

/* ---------- 数据持久化 ---------- */
function loadData() {
  var raw = null;
  try { raw = localStorage.getItem(LS_DATA); } catch (e) {}
  if (raw) {
    try {
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed) && parsed.length) return parsed;
    } catch (e) {}
  }
  return deepClone(window.SUN_PANEL_DATA || []);
}
function saveData() {
  try { localStorage.setItem(LS_DATA, JSON.stringify(state.groups)); } catch (e) {
    toast('数据较大，保存失败：' + e.message);
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
               (it.desc || '').toLowerCase().indexOf(q) >= 0 ||
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
  if (item.desc) body.appendChild(el('div', 'desc', escapeHtml(item.desc)));

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
    $('fDesc').value = it.desc || '';
    $('fLogo').value = it.logo || '';
  }
  fillGroupSelect(gi);
  $('fGroupField').classList.remove('hidden');
  $('modal').classList.remove('hidden');
  $('fTitle').focus();
}
function closeModal() { $('modal').classList.add('hidden'); $('importModal').classList.add('hidden'); }
$('modalCancel').addEventListener('click', closeModal);
$('importCancel').addEventListener('click', closeModal);
$('modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
$('importModal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });

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
    desc: $('fDesc').value.trim(),
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
    it.desc = data.desc; it.logo = data.logo;
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
            description: it.desc || '',
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
        return {
          title: (it.title || '').trim(),
          url: (it.url || '').trim(),
          lanUrl: (it.lanUrl || '').trim(),
          desc: (it.desc || it.description || '').trim(),
          logo: (it.logo || (it.icon && it.icon.src) || '').trim()
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
      L.push('        <DT><A HREF="' + escAttr(it.url || '') + '">' + escAttr(it.title || '') + '</A>');
    });
    L.push('    </DL><p>');
  });
  L.push('</DL><p>');
  return L.join('\n');
}
$('exportBtn').addEventListener('click', function () { $('exportModal').classList.remove('hidden'); });
$('expJson').addEventListener('click', function () {
  $('exportModal').classList.add('hidden');
  var fname = 'SunPanel-Data' + fmtDate(new Date()).replace(/[-: ]/g, '') + '.sun-panel.json';
  doExport(fname, JSON.stringify(toSunPanel(state.groups), null, 2), 'application/json');
});
$('expHtml').addEventListener('click', function () {
  $('exportModal').classList.add('hidden');
  var fname = 'bookmarks-' + fmtDate(new Date()).replace(/[-: ]/g, '') + '.html';
  doExport(fname, toBookmarksHtml(state.groups), 'text/html');
});
$('expClose').addEventListener('click', function () { $('exportModal').classList.add('hidden'); });
$('exportModal').addEventListener('click', function (e) { if (e.target === this) this.classList.add('hidden'); });
$('importBtn').addEventListener('click', function () { $('importModal').classList.remove('hidden'); });
function dedupKey(it) { return ((it.title || '').trim().toLowerCase() + '||' + (it.url || '').trim().toLowerCase()); }
/* 合并去重：同名分类并入现有，同名同链接自动排除 */
function mergeGroups(existing, incoming) {
  var out = deepClone(existing);
  incoming.forEach(function (ig) {
    var match = null;
    for (var i = 0; i < out.length; i++) if (out[i].title === ig.title) { match = out[i]; break; }
    if (match) {
      var keys = {};
      match.items.forEach(function (it) { keys[dedupKey(it)] = 1; });
      ig.items.forEach(function (it) {
        if (!keys[dedupKey(it)]) { match.items.push(it); keys[dedupKey(it)] = 1; }
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
  var modeEl = document.querySelector('input[name=importMode]:checked');
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
      if (url) cur.items.push({ title: (a.textContent || '').trim() || url, url: url });
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
$('importOk').addEventListener('click', function () {
  var f = $('importFile');
  if (!f.files || !f.files[0]) { toast('请选择 JSON 文件'); return; }
  var reader = new FileReader();
  reader.onload = function (e) {
    try { doImport(e.target.result); }
    catch (er) { toast('导入失败：' + er.message); }
  };
  reader.readAsText(f.files[0]);
});
/* 从剪贴板导入（移动端文件选择器不可用时兜底） */
$('importPaste').addEventListener('click', function () {
  if (!navigator.clipboard || !navigator.clipboard.readText) { toast('当前浏览器不支持读取剪贴板'); return; }
  navigator.clipboard.readText().then(function (text) {
    if (!text || !text.trim()) { toast('剪贴板为空'); return; }
    try { doImport(text); }
    catch (er) { toast('导入失败：剪贴板内容不是有效配置：' + er.message); }
  }, function () { toast('读取剪贴板失败，请检查浏览器权限'); });
});
/* 重置数据：仅保留「功能工具」一个分组，其它分组与标签全部清空 */
function buildResetData() {
  var tool = null, i;
  var def = deepClone(window.SUN_PANEL_DATA || []);
  for (i = 0; i < def.length; i++) {
    if (def[i] && def[i].title === TOOL_GROUP_TITLE) { tool = def[i]; break; }
  }
  if (!tool) {
    for (i = 0; i < state.groups.length; i++) {
      if (state.groups[i] && state.groups[i].title === TOOL_GROUP_TITLE) { tool = deepClone(state.groups[i]); break; }
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
    tool.items.unshift({ widget: 'ipmonitor', title: 'IP 与连通性测试', desc: '实时检测本机公网 IP 与主要站点连通性，自动刷新' });
  }
  if (!hasWidget('calclock')) {
    var pos = 0;
    for (var j = 0; j < tool.items.length; j++) if (tool.items[j].widget === 'ipmonitor') pos = j + 1;
    tool.items.splice(pos, 0, { widget: 'calclock', title: '日历与时钟', desc: '当前日期与实时时间' });
  }
  return [tool];
}
$('resetBtn').addEventListener('click', function () {
  if (!confirm('确定重置？将只保留「' + TOOL_GROUP_TITLE + '」一个分组，其它所有分组和标签都会被清空。')) return;
  state.groups = buildResetData();
  state.activeGroup = null;
  state.query = '';
  $('searchInput').value = '';
  saveData(); renderTree(); renderContent();
  toast('已重置：仅保留「' + TOOL_GROUP_TITLE + '」');
});

/* ---------- 搜索与搜索引擎 ---------- */
function runSearch() {
  var q = $('searchInput').value.trim();
  if (!q) { toast('请输入搜索内容'); return; }
  var all = getEngines();
  var engines = all.filter(function (en) { return state.engines.has(en.id || en.name); });
  var targets = engines.length ? engines
    : [all.filter(function (e) { return e.id === DEFAULT_ENGINE; })[0] || all[0]];
  var opened = 0;
  targets.forEach(function (en) {
    var w = window.open(engineUrl(en, q), '_blank');
    if (w) opened++;
  });
  // 保持本页焦点
  try { window.focus(); } catch (e) {}
  if (opened < targets.length) toast('部分搜索页被浏览器拦截，请允许弹窗');
  // 清空搜索框并重置筛选
  $('searchInput').value = '';
  state.query = '';
  renderContent();
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
function init() {
  state.groups = loadData();
  try {
    var t = localStorage.getItem(LS_THEME);
    applyTheme(t === 'light' ? 'light' : 'dark');
  } catch (e) { applyTheme('dark'); }
  try {
    var es = JSON.parse(localStorage.getItem(LS_ENGINE) || '[]');
    if (Array.isArray(es)) es.forEach(function (id) { state.engines.add(id); });
  } catch (e) {}
  $('appVersion').textContent = APP_VERSION;
  renderEngines();
  setEngineHidden(window.innerWidth <= 760);   // 窄屏默认收起引擎选项，节省空间
  renderTree();
  renderContent();
}
document.addEventListener('DOMContentLoaded', init);
})();
