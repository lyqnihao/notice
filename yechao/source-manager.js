/* 夜潮资源站管理：纯前端、本地保存、直连苹果CMS V10采集接口 */
(function () {
  'use strict';
  const KEY = 'nc_sources_v1', SUB_KEY = 'nc_subscriptions_v1', ACTIVE_KEY = 'nc_active_source_v1';
  const $ = (s, p = document) => p.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cleanUrl = value => {
    const u = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('只允许 HTTP/HTTPS 接口地址');
    u.hash = ''; return u.href;
  };
  const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch (_) { return fallback; } };
  let sources = read(KEY, null), subscriptions = read(SUB_KEY, []), activeId = read(ACTIVE_KEY, '');
  let panelOpen = false;
  const save = () => { localStorage.setItem(KEY, JSON.stringify(sources)); localStorage.setItem(SUB_KEY, JSON.stringify(subscriptions)); localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeId)); };
  const normalize = (s, i = 0) => ({
    id: String(s.id || ('src_' + Date.now() + '_' + i)), name: String(s.name || '未命名线路').trim(),
    api: cleanUrl(s.api || s.url), enabled: s.enabled !== false, note: String(s.note || ''),
    tags: Array.isArray(s.tags) ? s.tags : [], origin: s.origin || 'manual', subscriptionId: s.subscriptionId || '',
    status: s.status || '未检测', latency: Number(s.latency) || 0, lastChecked: s.lastChecked || ''
  });
  async function init() {
    if (!sources) {
      try {
        const r = await fetch('./sources.json', {cache:'no-store'});
        const list = await r.json();
        sources = list.filter(s => /\/api\.php\/provide\/vod\/?$/i.test(s.api || ''))
          .map((s, i) => normalize({...s, enabled: i < 2 || /apiyutu\.com/i.test(s.api), origin:'builtin'}, i));
      } catch (_) { sources = []; }
      if (!sources.length) sources = [];
      activeId = sources.find(s => s.enabled)?.id || '';
      save();
    } else {
      sources = sources.map((s, i) => { try { return normalize(s, i); } catch (_) { return null; } }).filter(Boolean);
      if (!sources.some(s => s.id === activeId && s.enabled)) activeId = sources.find(s => s.enabled)?.id || '';
    }
    save();
    return sources;
  }
  const enabled = () => sources.filter(s => s.enabled);
  const apis = () => enabled().map(s => s.api);
  const active = () => enabled().findIndex(s => s.id === activeId);
  const sourceAt = i => enabled()[i];
  function statusClass(s) { return s.status === '正常' ? 'ok' : (s.status.includes('跨域') || s.status.includes('失败') || s.status.includes('异常') ? 'bad' : 'muted'); }
  function render() {
    const list = $('#smSourceList'); if (!list) return;
    const on = enabled().length;
    $('#smSummary').textContent = `${sources.length} 条线路 · ${on} 条启用 · ${subscriptions.length} 个订阅`;
    list.innerHTML = sources.map(s => `<article class="sm-source" data-id="${esc(s.id)}">
      <div class="sm-source-main"><label class="sm-check"><input type="checkbox" data-sm="enabled" ${s.enabled?'checked':''}><span></span></label>
      <div class="sm-source-info"><div class="sm-source-title">${esc(s.name)} <span class="sm-status ${statusClass(s)}">${esc(s.status)}</span></div>
      <div class="sm-source-url">${esc(s.api)}</div><div class="sm-source-note">${esc(s.note || (s.origin === 'subscription' ? '订阅导入' : '手动添加'))}${s.latency ? ` · ${s.latency} ms` : ''}</div></div>
      <div class="sm-source-actions"><button data-sm-act="select" class="${s.id===activeId?'selected':''}" ${!s.enabled?'disabled':''}>${s.id===activeId?'正在使用':'设为使用'}</button><button data-sm-act="test">检测</button><button data-sm-act="edit">编辑</button><button data-sm-act="delete" class="danger">删除</button></div></div></article>`).join('') || '<div class="sm-empty">还没有线路，手动添加或导入订阅即可开始。</div>';
    $('#smSubList').innerHTML = subscriptions.map(s => `<div class="sm-sub"><div><b>${esc(s.name)}</b><small>${esc(s.url)}</small><small>上次更新：${s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '尚未更新'}</small></div><button data-sub-act="update" data-id="${esc(s.id)}">更新</button><button data-sub-act="delete" data-id="${esc(s.id)}" class="danger">删除</button></div>`).join('') || '<div class="sm-empty">暂无订阅。</div>';
  }
  function open() { panelOpen = true; $('#sourcePanel').hidden = false; document.body.style.overflow='hidden'; render(); }
  function close() { panelOpen = false; $('#sourcePanel').hidden = true; document.body.style.overflow=''; }
  function form(source) {
    $('#smEditTitle').textContent = source ? '编辑线路' : '添加线路';
    $('#smEditId').value = source?.id || '';
    $('#smName').value = source?.name || '';
    $('#smApi').value = source?.api || '';
    $('#smNote').value = source?.note || '';
    $('#smEditMask').hidden = false;
    setTimeout(() => $('#smName').focus(), 20);
  }
  async function test(s) {
    s.status = '检测中'; render();
    const started = performance.now();
    try {
      const u = new URL(s.api); u.searchParams.set('ac','list');
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
      let response;
      try { response = await fetch(u.href, {headers:{Accept:'application/json'}, signal:controller.signal, cache:'no-store'}); }
      finally { clearTimeout(timer); }
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!data || (!Array.isArray(data.class) && !Array.isArray(data.list))) throw new Error('返回格式不是苹果CMS采集 JSON');
      s.status = '正常'; s.latency = Math.round(performance.now() - started); s.lastChecked = new Date().toISOString();
    } catch (e) {
      s.latency = Math.round(performance.now() - started); s.lastChecked = new Date().toISOString();
      if (e.name === 'AbortError') s.status = '请求超时';
      else if (e instanceof TypeError) s.status = '跨域或网络失败';
      else s.status = '接口异常：' + e.message;
    }
    save(); render();
    if (window.toast) toast(`${s.name}：${s.status}`);
  }
  async function testAll() { for (const s of enabled()) await test(s); }
  function parseSubscription(data) {
    const rows = Array.isArray(data) ? data : (data.sources || data.list || data.data || []);
    if (!Array.isArray(rows)) throw new Error('订阅内容中没有线路数组');
    return rows.map((r,i) => { const api=r.api || r.url || r.ext; let id=r.id; if(!id && api){ let h=0; for(const c of String(api)) h=((h<<5)-h+c.charCodeAt(0))|0; id='subsrc_'+Math.abs(h); } return normalize({id, name:r.name || r.title || r.key || `订阅线路 ${i+1}`, api, note:r.note || r.remark || '', tags:r.tags || [], enabled:r.enabled !== false, origin:'subscription'}, i); });
  }
  async function updateSubscription(sub) {
    try {
      const r = await fetch(sub.url, {headers:{Accept:'application/json'}, cache:'no-store'});
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const incoming = parseSubscription(await r.json());
      const oldIds = new Set(sources.filter(s => s.subscriptionId === sub.id).map(s => s.id));
      const incomingIds = new Set();
      incoming.forEach((s,i) => {
        s.id = s.id || `${sub.id}_${i}`; incomingIds.add(s.id); s.origin='subscription'; s.subscriptionId=sub.id;
        const old = sources.find(x => x.id === s.id);
        if (old) Object.assign(old, {name:s.name, api:s.api, note:s.note, tags:s.tags}); else sources.push(s);
      });
      // 删除订阅中已不存在的旧条目，但绝不删除手动线路
      sources = sources.filter(s => !(oldIds.has(s.id) && !incomingIds.has(s.id)));
      sub.updatedAt = new Date().toISOString(); save(); render(); document.dispatchEvent(new Event('source-manager-change'));
      if (window.toast) toast(`订阅更新完成，读取 ${incoming.length} 条线路`);
    } catch (e) { if (window.toast) toast('订阅更新失败：' + (e instanceof TypeError ? '订阅站可能未开放跨域' : e.message)); }
  }
  function exportConfig() {
    const blob = new Blob([JSON.stringify({version:1,sources,subscriptions,activeId},null,2)], {type:'application/json'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='noctide-sources.json'; a.click(); URL.revokeObjectURL(a.href);
  }
  async function importConfig(file) {
    try {
      const data = JSON.parse(await file.text());
      const rows = parseSubscription(data.sources || data);
      rows.forEach(s => { if (!sources.some(x=>x.id===s.id)) sources.push(s); });
      if (Array.isArray(data.subscriptions)) subscriptions = data.subscriptions;
      if (data.activeId && sources.some(s => s.id === data.activeId && s.enabled)) activeId = data.activeId;
      if (!sources.some(s => s.id === activeId && s.enabled)) activeId = enabled()[0]?.id || '';
      save(); render(); document.dispatchEvent(new Event('source-manager-change')); toast('配置导入完成');
    } catch(e) { toast('导入失败：' + e.message); }
  }
  document.addEventListener('click', async e => {
    if (e.target.closest('#sourceManageBtn')) { open(); return; }
    if (e.target.closest('#smClose') || e.target === $('#sourcePanel')) { close(); return; }
    if (e.target.closest('#smAdd')) { form(); return; }
    if (e.target.closest('#smCancel') || e.target === $('#smEditMask')) { $('#smEditMask').hidden=true; return; }
    if (e.target.closest('#smSave')) {
      try {
        const id=$('#smEditId').value, item=normalize({id:id||undefined,name:$('#smName').value,api:$('#smApi').value,note:$('#smNote').value,enabled:true,origin:'manual'});
        if (!item.name) throw new Error('请填写线路名称');
        const old=sources.find(s=>s.id===id); if(old) Object.assign(old,item); else sources.unshift(item);
        if (!activeId) activeId=item.id; save(); render(); document.dispatchEvent(new Event('source-manager-change')); $('#smEditMask').hidden=true; toast('线路已保存');
      } catch(err) { toast(err.message); }
      return;
    }
    if (e.target.closest('#smTestAll')) { testAll(); return; }
    if (e.target.closest('#smExport')) { exportConfig(); return; }
    if (e.target.closest('#smImportBtn')) { $('#smImportFile').click(); return; }
    if (e.target.closest('#smAddSub')) {
      try { const url=cleanUrl($('#smSubUrl').value); const name=$('#smSubName').value.trim()||new URL(url).hostname;
        const sub={id:'sub_'+Date.now(),name,url,updatedAt:''}; subscriptions.push(sub); save(); render(); $('#smSubUrl').value=''; $('#smSubName').value=''; await updateSubscription(sub);
      } catch(err) { toast(err.message); }
      return;
    }
    const sourceRow=e.target.closest('.sm-source');
    if (sourceRow) {
      const s=sources.find(x=>x.id===sourceRow.dataset.id); if(!s)return;
      const act=e.target.closest('[data-sm-act]')?.dataset.smAct;
      if(e.target.matches('input[data-sm="enabled"]')) { s.enabled=e.target.checked; if(!s.enabled && activeId===s.id) activeId=enabled()[0]?.id||''; if(s.enabled&&!activeId)activeId=s.id; save(); render(); document.dispatchEvent(new Event('source-manager-change')); return; }
      if(act==='select') { if(s.enabled){activeId=s.id; save(); render(); document.dispatchEvent(new Event('source-manager-change')); toast('已切换默认线路');} return; }
      if(act==='test') { await test(s); return; }
      if(act==='edit') { form(s); return; }
      if(act==='delete') { if(confirm(`确定删除线路「${s.name}」？`)){sources=sources.filter(x=>x.id!==s.id);if(activeId===s.id)activeId=enabled()[0]?.id||'';save();render();document.dispatchEvent(new Event('source-manager-change'));} return; }
    }
    const subBtn=e.target.closest('[data-sub-act]');
    if(subBtn) { const sub=subscriptions.find(x=>x.id===subBtn.dataset.id); if(!sub)return; if(subBtn.dataset.subAct==='update') await updateSubscription(sub); else if(confirm(`删除订阅「${sub.name}」及其导入线路？`)){sources=sources.filter(s=>s.subscriptionId!==sub.id);subscriptions=subscriptions.filter(x=>x.id!==sub.id);if(!sources.some(s=>s.id===activeId && s.enabled))activeId=enabled()[0]?.id||'';save();render();document.dispatchEvent(new Event('source-manager-change'));} }
  });
  document.addEventListener('change', e => { if(e.target.id==='smImportFile' && e.target.files[0]) importConfig(e.target.files[0]); });
  document.addEventListener('keydown', e => { if(e.key==='Escape'){ if(!$('#smEditMask').hidden)$('#smEditMask').hidden=true; else if(panelOpen)close(); } });
  window.SourceManager = {init, enabled, apis, active, sourceAt, getSources:()=>sources, getActiveId:()=>activeId, setActiveIndex:i=>{const s=enabled()[i];if(s){activeId=s.id;save();}}, open};
})();
