/* ============================================================
   夜潮 NOCTIDE v3.2.0 —— 资源站管理 source-manager.js
   纯前端 / 本地保存 / 请求模式（直连·中继）/ 多格式订阅 / 增量更新
   核心纯逻辑委托 window.NC（signal-core.js）。
   ============================================================ */
(function () {
  'use strict';
  const NC = window.NC || {};
  const KEY = 'nc_sources_v1', SUB_KEY = 'nc_subscriptions_v1', ACTIVE_KEY = 'nc_active_source_v1';
  const CFG_KEY = 'nc_config_v1', SEL_KEY = 'nc_selection_v1';
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => [...p.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cleanUrl = value => {
    const u = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('只允许 HTTP/HTTPS 接口地址');
    u.hash = ''; return u.href;
  };
  const read = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? fallback : v; } catch (_) { return fallback; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

  let sources = read(KEY, null);
  let subscriptions = read(SUB_KEY, []);
  let activeId = read(ACTIVE_KEY, '');
  let cfg = Object.assign({ mode: 'fallback', relay: '', timeout: 10000 }, read(CFG_KEY, {}));
  let selected = new Set(read(SEL_KEY, []));
  let panelOpen = false;
  let testing = false;

  function save() {
    write(KEY, sources); write(SUB_KEY, subscriptions); write(ACTIVE_KEY, activeId);
    write(CFG_KEY, cfg); write(SEL_KEY, [...selected]);
  }

  /* 数据迁移：兼容旧版字段，补齐新字段，绝不丢数据 */
  function normalize(s, i = 0) {
    const rawApi = s.api || s.url || s.apiUrl || s.baseUrl || '';
    let api = '';
    try { api = cleanUrl(rawApi); } catch (_) { api = String(rawApi || ''); }
    const id = String(s.id || (s.key && NC.stableId ? NC.stableId(s.key, 'src') : ('src_' + Date.now() + '_' + i)));
    return {
      id, name: String(s.name || s.title || s.key || '未命名线路').trim(),
      api, enabled: s.enabled !== false && s.isActive !== 0 && s.active !== false,
      note: String(s.note || s.remark || s.description || ''),
      detail: String(s.detail || ''),
      tags: Array.isArray(s.tags) ? s.tags.map(String) : (typeof s.tag === 'string' ? [s.tag] : []),
      priority: s.priority, proxyMode: s.proxyMode || '', customProxy: s.customProxy || '',
      origin: s.origin || 'manual', subscriptionId: s.subscriptionId || '',
      status: s.status || '未检测', statusCode: s.statusCode || '',
      latency: Number(s.latency) || 0, lastChecked: s.lastChecked || '',
    };
  }

  async function init() {
    if (!sources) {
      try {
        const r = await fetch('./sources.json', { cache: 'no-store' });
        const list = await r.json();
        sources = list.filter(s => /\/api\.php\/provide\/vod\/?$/i.test(s.api || ''))
          .map((s, i) => normalize({ ...s, enabled: i < 2 || /apiyutu\.com/i.test(s.api), origin: 'builtin' }, i));
      } catch (_) { sources = []; }
      activeId = sources.find(s => s.enabled)?.id || '';
    } else {
      // 迁移旧数据：逐条 normalize，坏数据保留原始最小信息不丢弃
      sources = sources.map((s, i) => {
        try { return normalize(s, i); }
        catch (_) { return { id: s.id || ('broken_' + i), name: String(s.name || '损坏线路'), api: String(s.api || ''), enabled: false, origin: 'manual', status: '数据异常', tags: [] }; }
      });
      if (!sources.some(s => s.id === activeId && s.enabled)) activeId = sources.find(s => s.enabled)?.id || '';
    }
    // 恢复请求模式 UI
    const m = $('#smReqMode'); if (m) m.value = cfg.mode;
    const relay = $('#smRelay'); if (relay) relay.value = cfg.relay;
    const to = $('#smTimeout'); if (to) to.value = cfg.timeout;
    save();
    return sources;
  }

  const enabled = () => sources.filter(s => s.enabled);
  const apis = () => enabled().map(s => s.api).filter(Boolean);
  const active = () => enabled().findIndex(s => s.id === activeId);
  const sourceAt = i => enabled()[i];
  function statusClass(s) {
    const c = s.statusCode;
    if (c === 'ok' || s.status === '正常') return 'ok';
    if (c === 'timeout' || c === 'http' || c === 'cors_network' || c === 'relay' || c === 'format' || c === 'html') return 'bad';
    return 'muted';
  }

  function render() {
    const list = $('#smSourceList'); if (!list) return;
    const on = enabled().length;
    $('#smSummary').textContent = `${sources.length} 条线路 · ${on} 条启用 · ${subscriptions.length} 个订阅 · ${cfg.mode === 'direct' ? '直连' : cfg.mode === 'relay-first' ? '优先中继' : '直连失败回退'}`;
    list.innerHTML = sources.map(s => {
      const badge = s.origin === 'subscription' ? '订阅' : (s.origin === 'builtin' ? '内置' : '手动');
      return `<article class="sm-source${selected.has(s.id) ? ' checked' : ''}" data-id="${esc(s.id)}">
        <div class="sm-source-main">
          <label class="sm-check" title="勾选用于批量操作"><input type="checkbox" data-sm="checked" ${selected.has(s.id) ? 'checked' : ''}><span></span></label>
          <div class="sm-source-info">
            <div class="sm-source-title">${esc(s.name)} <span class="sm-badge-origin">${badge}</span> <span class="sm-status ${statusClass(s)}">${esc(s.status)}</span></div>
            <div class="sm-source-url">${esc(s.api)}</div>
            <div class="sm-source-note">${esc(s.note || (s.origin === 'subscription' ? '订阅导入' : '手动添加'))}${s.latency ? ` · ${s.latency} ms` : ''}${s.tags && s.tags.length ? ' · ' + esc(s.tags.join('/')) : ''}</div>
          </div>
          <label class="sm-switch" title="启用/禁用（禁用不参与采集，仍可手动检测）">
            <input type="checkbox" data-sm="enabled" ${s.enabled ? 'checked' : ''}><span class="sm-track"></span><em>${s.enabled ? '启用' : '禁用'}</em>
          </label>
        </div>
        <div class="sm-source-actions">
          <button data-sm-act="select" class="${s.id === activeId ? 'selected' : ''}" ${!s.enabled ? 'disabled' : ''}>${s.id === activeId ? '正在使用' : '设为使用'}</button>
          <button data-sm-act="test">检测</button>
          <button data-sm-act="edit">编辑</button>
          <button data-sm-act="delete" class="danger">删除</button>
        </div>
      </article>`;
    }).join('') || '<div class="sm-empty">还没有线路，手动添加或导入订阅即可开始。</div>';

    $('#smSubList').innerHTML = subscriptions.map(s => `<div class="sm-sub"><div><b>${esc(s.name)}</b><small>${esc(s.url)}</small><small>上次更新：${s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '尚未更新'}${s.lastResult ? ' · ' + esc(s.lastResult) : ''}</small></div><button data-sub-act="update" data-id="${esc(s.id)}">更新</button><button data-sub-act="delete" data-id="${esc(s.id)}" class="danger">删除</button></div>`).join('') || '<div class="sm-empty">暂无订阅。</div>';
  }

  function open() { panelOpen = true; $('#sourcePanel').hidden = false; document.body.style.overflow = 'hidden'; render(); }
  function close() { panelOpen = false; $('#sourcePanel').hidden = true; document.body.style.overflow = ''; }
  function form(source) {
    $('#smEditTitle').textContent = source ? '编辑线路' : '添加线路';
    $('#smEditId').value = source?.id || '';
    $('#smName').value = source?.name || '';
    $('#smApi').value = source?.api || '';
    $('#smNote').value = source?.note || '';
    $('#smEditMask').hidden = false;
    setTimeout(() => $('#smName').focus(), 20);
  }
  function toast(msg) { if (window.toast) window.toast(msg); else console.log('[NOCTIDE]', msg); }
  function changed() { save(); render(); document.dispatchEvent(new Event('source-manager-change')); }

  /* 统一请求：JSON + 错误分类；返回 {ok, data, statusCode, label, via, ms} */
  async function requestJson(url) {
    const t0 = performance.now();
    let res;
    try {
      res = await NC.fetchWithMode(url, {
        mode: cfg.mode, relay: cfg.relay, timeout: cfg.timeout,
        fetchOptions: { headers: { Accept: 'application/json' }, cache: 'no-store' },
      });
    } catch (e) {
      const first = e.attempts && e.attempts[0] && e.attempts[0].error;
      const kind = NC.classifyError(first || e);
      return { ok: false, statusCode: kind.code, label: kind.label, via: 'none', ms: Math.round(performance.now() - t0) };
    }
    const ms = Math.round(performance.now() - t0);
    if (!res.response.ok) {
      return { ok: false, statusCode: 'http', label: 'HTTP 错误 ' + res.response.status, via: res.via, ms };
    }
    let text;
    try { text = await res.response.text(); } catch (_) {
      return { ok: false, statusCode: 'network', label: '读取响应失败', via: res.via, ms };
    }
    if (NC.isHtml(text)) {
      return { ok: false, statusCode: 'html', label: '响应格式错误（返回 HTML/登录页）', via: res.via, ms };
    }
    let data;
    try { data = JSON.parse(text); } catch (_) {
      return { ok: false, statusCode: 'format', label: '响应格式错误（非 JSON）', via: res.via, ms };
    }
    return { ok: true, data, statusCode: 'ok', label: '正常', via: res.via, ms };
  }

  /* 检测单条线路：苹果 CMS V10 风格 JSON 校验 */
  async function test(s) {
    s.status = '检测中'; s.statusCode = ''; render();
    let url;
    try { url = new URL(s.api); url.searchParams.set('ac', 'list'); }
    catch (_) { s.status = '地址无效'; s.statusCode = 'format'; save(); render(); return false; }
    const r = await requestJson(url.href);
    s.latency = r.ms; s.lastChecked = new Date().toISOString();
    if (r.ok) {
      const d = r.data;
      if (d && (Array.isArray(d.class) || Array.isArray(d.list))) {
        s.status = '正常'; s.statusCode = 'ok';
      } else {
        s.status = '响应格式错误'; s.statusCode = 'format';
      }
    } else {
      s.status = r.label; s.statusCode = r.statusCode;
    }
    save(); render();
    return r.ok && s.statusCode === 'ok';
  }

  /* 并发控制的批量检测：含禁用资源；显示进度与统计 */
  async function batchTest(list, label) {
    if (testing) { toast('正在检测中，请稍候'); return; }
    if (!list.length) { toast(label + '：没有可检测的线路'); return; }
    testing = true;
    const total = list.length;
    let done = 0;
    const stat = { ok: 0, timeout: 0, http: 0, cors: 0, format: 0, relay: 0, other: 0 };
    const prog = $('#smProgress'), bar = $('#smProgressBar'), txt = $('#smProgressText');
    const summary = $('#smTestSummary');
    prog.hidden = false; summary.hidden = true;
    const upd = () => {
      bar.style.width = Math.round(done / total * 100) + '%';
      txt.textContent = `${label} ${done}/${total} · 正常 ${stat.ok} · 超时 ${stat.timeout} · HTTP ${stat.http} · 跨域 ${stat.cors} · 格式 ${stat.format}`;
    };
    upd();
    const limit = Math.min(4, total); // 并发上限 4，避免源站/中继过载
    let idx = 0;
    const worker = async () => {
      while (idx < total) {
        const s = list[idx++];
        const ok = await test(s);
        if (ok) stat.ok++;
        else {
          const c = s.statusCode;
          if (c === 'timeout') stat.timeout++;
          else if (c === 'http') stat.http++;
          else if (c === 'cors_network' || c === 'network') stat.cors++;
          else if (c === 'format' || c === 'html') stat.format++;
          else if (c === 'relay') stat.relay++;
          else stat.other++;
        }
        done++; upd();
      }
    };
    await Promise.all(Array.from({ length: limit }, worker));
    testing = false;
    summary.hidden = false;
    summary.className = 'sm-test-summary';
    summary.innerHTML = `<b>${label}完成</b>：共 ${total} 条 · <span class="ok">正常 ${stat.ok}</span> · 超时 ${stat.timeout} · HTTP ${stat.http} · 跨域/网络 ${stat.cors} · 格式错误 ${stat.format}${stat.relay ? ' · 中继失败 ' + stat.relay : ''}`;
    toast(`${label}完成：正常 ${stat.ok}/${total}`);
  }

  /* 订阅更新：拉文本 → NC 解析（JSON/Base58）→ NC 增量合并 → 失败保留旧资源 */
  async function updateSubscription(sub, silent) {
    // 一次性取原始文本，交给 NC 统一识别 JSON / Base58，避免重复请求
    let rawText = '';
    let res;
    try {
      res = await NC.fetchWithMode(sub.url, {
        mode: cfg.mode, relay: cfg.relay, timeout: cfg.timeout,
        fetchOptions: { headers: { Accept: 'application/json, text/plain' }, cache: 'no-store' },
      });
    } catch (e) {
      const first = e.attempts && e.attempts[0] && e.attempts[0].error;
      const kind = NC.classifyError(first || e);
      sub.lastResult = kind.label;
      toast(`订阅「${sub.name}」更新失败：${kind.label}`);
      save(); render();
      return { ok: false, label: kind.label };
    }
    if (!res.response.ok) {
      const label = 'HTTP 错误 ' + res.response.status;
      sub.lastResult = label; toast(`订阅「${sub.name}」更新失败：${label}`);
      save(); render(); return { ok: false, label };
    }
    try { rawText = await res.response.text(); }
    catch (_) {
      sub.lastResult = '读取响应失败'; toast(`订阅「${sub.name}」读取响应失败`);
      save(); render(); return { ok: false, label: '读取响应失败' };
    }
    if (NC.isHtml(rawText)) {
      sub.lastResult = '响应格式错误（返回 HTML/登录页）';
      toast(`订阅「${sub.name}」返回了 HTML，未更新`);
      save(); render(); return { ok: false, label: sub.lastResult };
    }
    let parsed;
    try {
      parsed = NC.parseSubscriptionFromText
        ? NC.parseSubscriptionFromText(rawText)
        : NC.parseSubscription(JSON.parse(rawText));
    } catch (e) {
      sub.lastResult = '解析失败：' + e.message;
      toast(`订阅「${sub.name}」解析失败：${e.message}`);
      save(); render();
      return { ok: false, label: e.message };
    }
    if (parsed.errors && parsed.errors.length && !parsed.sources.length) {
      sub.lastResult = parsed.errors[0];
      toast(`订阅「${sub.name}」：${parsed.errors[0]}`);
      save(); render();
      return { ok: false, label: parsed.errors[0] };
    }
    const merged = NC.mergeSubscription
      ? NC.mergeSubscription(sources, parsed.sources, sub)
      : { sources, stats: {}, errors: [] };
    sources = merged.sources;
    sub.updatedAt = new Date().toISOString();
    const st = merged.stats || {};
    sub.lastResult = `新增${st.added || 0}/更新${st.updated || 0}/删除${st.removed || 0}/跳过${st.skipped || 0}`;
    if (!sources.some(s => s.id === activeId && s.enabled)) activeId = enabled()[0]?.id || '';
    save(); render(); document.dispatchEvent(new Event('source-manager-change'));
    if (!silent) toast(`订阅「${sub.name}」：新增${st.added || 0} 更新${st.updated || 0} 删除${st.removed || 0} 跳过${st.skipped || 0}`);
    showSubResult(sub, st, parsed);
    return { ok: true, stats: st };
  }

  function showSubResult(sub, st, parsed) {
    const box = $('#smSubResult'); if (!box) return;
    box.hidden = false;
    box.innerHTML = `<b>订阅「${esc(sub.name)}」更新结果</b>
      <div class="sm-stat-grid">
        <span>新增 <b class="ok">${st.added || 0}</b></span>
        <span>更新 <b>${st.updated || 0}</b></span>
        <span>删除 <b>${st.removed || 0}</b></span>
        <span>跳过 <b>${st.skipped || 0}</b></span>
        <span>失败 <b class="bad">${st.failed || 0}</b></span>
        <span>格式 <b>${esc(parsed.format || '-')}</b>${parsed.via ? ' / ' + esc(parsed.via) : ''}</span>
      </div>
      ${(parsed.errors || []).length ? '<div class="sm-err">' + parsed.errors.map(esc).join('<br>') + '</div>' : ''}`;
  }

  function exportConfig() {
    const blob = new Blob([JSON.stringify({ version: 2, sources, subscriptions, activeId, cfg }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'noctide-sources.json'; a.click(); URL.revokeObjectURL(a.href);
  }
  async function importConfig(file) {
    try {
      const data = JSON.parse(await file.text());
      const rows = Array.isArray(data.sources) ? data.sources : (NC.parseSubscription ? NC.parseSubscription(data).sources : data);
      rows.forEach(s => {
        const item = normalize(s);
        if (!sources.some(x => x.id === item.id || (NC.normApi && NC.normApi(x.api) === NC.normApi(item.api)))) sources.push(item);
      });
      if (Array.isArray(data.subscriptions)) subscriptions = data.subscriptions;
      if (data.cfg) cfg = Object.assign(cfg, data.cfg);
      if (data.activeId && sources.some(s => s.id === data.activeId && s.enabled)) activeId = data.activeId;
      if (!sources.some(s => s.id === activeId && s.enabled)) activeId = enabled()[0]?.id || '';
      changed(); toast('配置导入完成');
    } catch (e) { toast('导入失败：' + e.message); }
  }

  /* ── 事件（统一委托） ─────────────────────────────────────── */
  document.addEventListener('click', async e => {
    if (e.target.closest('#sourceManageBtn')) { open(); return; }
    if (e.target.closest('#smClose') || e.target === $('#sourcePanel')) { close(); return; }
    if (e.target.closest('#smAdd')) { form(); return; }
    if (e.target.closest('#smCancel') || e.target === $('#smEditMask')) { $('#smEditMask').hidden = true; return; }
    if (e.target.closest('#smSave')) {
      try {
        const id = $('#smEditId').value;
        const item = normalize({ id: id || undefined, name: $('#smName').value, api: $('#smApi').value, note: $('#smNote').value, enabled: true, origin: 'manual' });
        if (!item.api || !/^https?:\/\//i.test(item.api)) throw new Error('请填写有效的 HTTP/HTTPS 接口地址');
        if (!item.name || item.name === '未命名线路') throw new Error('请填写线路名称');
        const old = sources.find(s => s.id === id);
        if (old) Object.assign(old, item); else sources.unshift(item);
        if (!activeId) activeId = item.id;
        changed(); $('#smEditMask').hidden = true; toast('线路已保存');
      } catch (err) { toast(err.message); }
      return;
    }
    if (e.target.closest('#smSelectAll')) { sources.forEach(s => selected.add(s.id)); save(); render(); return; }
    if (e.target.closest('#smInvertSel')) { sources.forEach(s => selected.has(s.id) ? selected.delete(s.id) : selected.add(s.id)); save(); render(); return; }
    if (e.target.closest('#smTestSel')) { batchTest(sources.filter(s => selected.has(s.id)), '检测选中'); return; }
    if (e.target.closest('#smTestAll')) { batchTest(sources.slice(), '检测全部'); return; }
    if (e.target.closest('#smExport')) { exportConfig(); return; }
    if (e.target.closest('#smImportBtn')) { $('#smImportFile').click(); return; }
    if (e.target.closest('#smUpdateAllSub')) {
      if (testing) { toast('正在检测中，请稍候'); return; }
      for (const sub of subscriptions) await updateSubscription(sub, true);
      toast('全部订阅已更新'); return;
    }
    if (e.target.closest('#smAddSub')) {
      try {
        const url = cleanUrl($('#smSubUrl').value);
        const name = $('#smSubName').value.trim() || new URL(url).hostname;
        const sub = { id: 'sub_' + Date.now(), name, url, updatedAt: '', lastResult: '' };
        subscriptions.push(sub); save(); render();
        $('#smSubUrl').value = ''; $('#smSubName').value = '';
        await updateSubscription(sub);
      } catch (err) { toast(err.message); }
      return;
    }
    const sourceRow = e.target.closest('.sm-source');
    if (sourceRow) {
      const s = sources.find(x => x.id === sourceRow.dataset.id); if (!s) return;
      const act = e.target.closest('[data-sm-act]')?.dataset.smAct;
      if (e.target.matches('input[data-sm="checked"]')) {
        e.target.checked ? selected.add(s.id) : selected.delete(s.id);
        sourceRow.classList.toggle('checked', e.target.checked); save(); return;
      }
      if (e.target.matches('input[data-sm="enabled"]')) {
        s.enabled = e.target.checked;
        if (!s.enabled && activeId === s.id) activeId = enabled()[0]?.id || '';
        if (s.enabled && !activeId) activeId = s.id;
        changed(); return;
      }
      if (act === 'select') { if (s.enabled) { activeId = s.id; changed(); toast('已切换默认线路'); } return; }
      if (act === 'test') { await test(s); return; }
      if (act === 'edit') { form(s); return; }
      if (act === 'delete') {
        if (confirm(`确定删除线路「${s.name}」？`)) {
          sources = sources.filter(x => x.id !== s.id); selected.delete(s.id);
          if (activeId === s.id) activeId = enabled()[0]?.id || '';
          changed();
        }
        return;
      }
    }
    const subBtn = e.target.closest('[data-sub-act]');
    if (subBtn) {
      const sub = subscriptions.find(x => x.id === subBtn.dataset.id); if (!sub) return;
      if (subBtn.dataset.subAct === 'update') await updateSubscription(sub);
      else if (confirm(`删除订阅「${sub.name}」及其导入线路？`)) {
        sources = sources.filter(s => !(s.subscriptionId === sub.id && s.origin === 'subscription'));
        subscriptions = subscriptions.filter(x => x.id !== sub.id);
        if (!sources.some(s => s.id === activeId && s.enabled)) activeId = enabled()[0]?.id || '';
        changed();
      }
    }
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'smImportFile' && e.target.files[0]) importConfig(e.target.files[0]);
    if (e.target.id === 'smReqMode') { cfg.mode = e.target.value; save(); render(); toast('请求模式已保存'); }
    if (e.target.id === 'smRelay') { cfg.relay = e.target.value.trim(); save(); }
    if (e.target.id === 'smTimeout') { const n = Number(e.target.value); cfg.timeout = (n >= 2000 && n <= 30000) ? n : 10000; e.target.value = cfg.timeout; save(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!$('#smEditMask').hidden) $('#smEditMask').hidden = true; else if (panelOpen) close(); }
  });

  window.SourceManager = {
    init, enabled, apis, active, sourceAt,
    getSources: () => sources,
    getActiveId: () => activeId,
    getCfg: () => cfg,
    setActiveIndex: i => { const s = enabled()[i]; if (s) { activeId = s.id; save(); } },
    open,
  };
})();
