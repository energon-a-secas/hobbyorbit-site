import { downloadText } from './neorgon-dom.js';
import { byId, announce, showError } from './ui-dom.js';
import { openCatalog, openEditor, openShare, openImport, openLock, confirmAction } from './dialogs.js';

export function bindEvents(ctx) {
  const { ui, store } = ctx;
  const checkinForm = byId('checkin-form');
  const goCheckin = () => {
    ctx.setView('wheel');
    byId('checkin-title').scrollIntoView({ behavior: 'instant', block: 'center' });
    byId('checkin-hobby').focus({ preventScroll: true });
  };
  const handlers = {
    async spin() {
      if (ui.spinning) return;
      const spinId = ++ui.spinId;
      ui.spinning = true; ctx.refresh();
      try { await ctx.wheel.spin(); }
      catch { announce('The spin could not finish. Try again.', true); }
      finally { if (ui.spinId === spinId) { ui.spinning = false; ctx.refresh(); } }
    },
    focus: (target) => ctx.setFocus(target.dataset.id),
    manage() { byId('hobby-manager').open = true; byId('hobby-manager').scrollIntoView({ behavior: 'instant', block: 'nearest' }); byId('hobby-manager').querySelector('summary').focus(); },
    catalog: () => openCatalog(ctx),
    'add-custom': () => openEditor(ctx),
    'edit-node': (target) => openEditor(ctx, target.dataset.id),
    'use-suggestion'() {
      if (!store.getState().nodes[ui.selectedId]) return;
      byId('checkin-hobby').value = ui.selectedId;
      showError('checkin-error'); goCheckin();
      announce('Ready for your check-in. Choose a feeling, then save when you want.');
    },
    'go-checkin': goCheckin,
    'toggle-lock': () => openLock(ctx),
    share: () => openShare(ctx),
    export() { downloadText(store.exportBackup(), `hobby-orbit-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json'); announce('Your backup download is ready. It includes your private notes.'); },
    recovery(target) {
      const original = store.getRecoveries().find((record) => record.id === target.dataset.recoveryId);
      if (original) downloadText(original.raw, `hobby-orbit-${original.id}.txt`);
    },
    import: () => byId('import-file').click(),
    'delete-entry'(target) {
      confirmAction({ title: 'Delete this journal entry?', description: 'This removes just this entry from your journal and its pattern counts. Your current hobby stays as it is.', label: 'Delete entry', danger: true,
        onConfirm: () => { const result = ctx.dispatch({ type: 'deleteEntry', id: target.dataset.id }); if (result.ok) announce('Journal entry deleted.'); return result; },
      });
    },
  };
  const move = (target, direction) => {
    const id = target.dataset.id;
    const result = ctx.dispatch({ type: 'moveNode', id, direction });
    if (result.ok) {
      const row = [...byId('manager-list').children].find((item) => item.dataset.nodeId === id);
      const next = row?.querySelector(`[data-action="${direction === -1 ? 'move-up' : 'move-down'}"]`);
      (next?.disabled ? row?.querySelector('[data-action="edit-node"]') : next)?.focus({ preventScroll: true });
      announce('Wheel order updated. Your journal stays the same.');
    }
  };
  handlers['move-up'] = (target) => move(target, -1);
  handlers['move-down'] = (target) => move(target, 1);
  byId('app-content').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-view]');
    if (tab) { ctx.setView(tab.dataset.view); return; }
    const target = event.target.closest('[data-action]');
    if (target && !target.disabled) handlers[target.dataset.action]?.(target);
  });
  document.querySelector('.app-tabs').addEventListener('keydown', (event) => {
    const tabs = [...document.querySelectorAll('[data-view]')];
    const index = tabs.indexOf(document.activeElement);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    ctx.setView(tabs[next].dataset.view, true);
  });
  byId('checkin-trigger').addEventListener('change', (event) => {
    const custom = event.target.value === '__custom__';
    byId('custom-trigger-field').hidden = !custom;
    if (custom) byId('checkin-custom-trigger').focus();
  });
  checkinForm.addEventListener('input', () => showError('checkin-error'));
  checkinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(checkinForm); const hobby = data.get('hobby');
    if (!hobby) { showError('checkin-error', 'Choose a hobby or taking a rest for this check-in.'); return; }
    const result = ctx.dispatch({ type: 'checkin', nodeId: hobby === '__rest__' ? null : hobby, mood: data.get('mood'), trigger: data.get('trigger') === '__custom__' ? data.get('customTrigger').trim() : data.get('trigger'), note: data.get('note') });
    if (!result.ok) { showError('checkin-error', result.error); return; }
    ctx.resetDraft();
    announce(result.saved ? 'Check-in saved. A little record of right now.' : 'Check-in kept for this session. Download a backup to keep it.');
  });
  byId('settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const result = ctx.dispatch({ type: 'settings', hemisphere: byId('hemisphere').value, motion: byId('motion').value });
    if (result.ok) announce(result.saved ? 'Preferences saved.' : 'Preferences changed for this session.');
  });
  byId('import-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''; showError('import-error');
    if (!file) return;
    try { openImport(ctx, await file.text()); }
    catch (error) { showError('import-error', error.message); }
  });
  let draggedId = null;
  const list = byId('manager-list');
  list.addEventListener('dragstart', (event) => {
    const row = event.target.closest('[data-node-id]');
    if (!row || event.target.closest('button')) { event.preventDefault(); return; }
    draggedId = row.dataset.nodeId;
    event.dataTransfer.setData('text/plain', draggedId); event.dataTransfer.effectAllowed = 'move';
    row.classList.add('is-dragging');
  });
  list.addEventListener('dragover', (event) => { if (draggedId && event.target.closest('[data-node-id]')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } });
  list.addEventListener('drop', (event) => {
    event.preventDefault();
    const target = event.target.closest('[data-node-id]')?.dataset.nodeId;
    const state = store.getState(); const siblings = ui.focusId ? state.nodes[ui.focusId]?.children : state.rootIds;
    const from = siblings?.indexOf(draggedId); const to = siblings?.indexOf(target);
    if (from >= 0 && to >= 0 && from !== to) {
      const direction = to > from ? 1 : -1;
      for (let i = 0; i < Math.abs(to - from); i++) {
        if (!ctx.dispatch({ type: 'moveNode', id: draggedId, direction }).ok) break;
      }
      announce('Wheel order updated. Your journal stays the same.');
    }
    draggedId = null;
  });
  list.addEventListener('dragend', () => { draggedId = null; list.querySelector('.is-dragging')?.classList.remove('is-dragging'); });
}
