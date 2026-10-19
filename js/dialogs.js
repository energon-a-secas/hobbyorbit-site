import { ICONS } from './icons.js';
import { searchCatalog, catalogPath } from './catalog.js';
import { validateState, TRIGGERS } from './model.js';
import { copyText, downloadText } from './neorgon-dom.js';
import { el, button, option, field, iconBadge, moodLabel, announce } from './ui-dom.js';

function dialogShell(title, wide = false) {
  const opener = document.activeElement;
  const dialog = el('dialog', `dialog${wide ? ' dialog--wide' : ''}`);
  const header = el('div', 'dialog-header');
  const heading = el('h2', '', title);
  heading.id = `dialog-${crypto.randomUUID()}`;
  dialog.setAttribute('aria-labelledby', heading.id);
  const close = () => dialog.close();
  const dismiss = button('Close', null, 'btn btn--quiet');
  dismiss.addEventListener('click', close);
  header.append(heading, dismiss);
  const body = el('div', 'dialog-body');
  const footer = el('div', 'dialog-footer');
  const error = el('p', 'form-error');
  error.setAttribute('role', 'alert'); error.hidden = true;
  dialog.append(header, body, error, footer);
  dialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') event.stopPropagation(); });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (opener?.isConnected && opener.getClientRects().length) opener.focus({ preventScroll: true });
    else {
      const activeDialog = [...document.querySelectorAll('dialog[open]')].at(-1);
      const fallback = activeDialog?.querySelector('button') || document.querySelector('[role="tab"][aria-selected="true"]');
      fallback?.focus({ preventScroll: true });
    }
  }, { once: true });
  document.body.append(dialog);
  return { dialog, body, footer, close, show: () => dialog.showModal(), fail(message) { error.textContent = message; error.hidden = false; } };
}

export function confirmAction({ title, description, content, label = 'Confirm', danger = false, onConfirm }) {
  const modal = dialogShell(title);
  modal.body.append(el('p', '', description));
  if (content) modal.body.append(content);
  const cancel = button('Cancel', null, 'btn btn--quiet');
  const confirm = button(label, null, danger ? 'btn btn--danger' : 'btn btn--primary');
  cancel.addEventListener('click', modal.close);
  confirm.addEventListener('click', () => {
    const result = onConfirm();
    if (result?.ok === false) modal.fail(result.error || 'This change could not be saved.');
    else modal.close();
  });
  modal.footer.append(cancel, confirm);
  modal.show(); cancel.focus();
}

function parentOptions(state, selected = null) {
  const select = el('select'); select.id = `parent-${crypto.randomUUID()}`;
  select.append(option('Main wheel', ''));
  const visit = (id, depth) => {
    const node = state.nodes[id];
    select.append(option(`${'　'.repeat(depth)}${node.label}`, id));
    node.children.forEach((child) => visit(child, depth + 1));
  };
  state.rootIds.forEach((id) => visit(id, 0));
  select.value = selected || '';
  return select;
}

export function openCatalog(ctx) {
  const modal = dialogShell('Find your hobbies', true);
  const search = el('input'); search.type = 'search'; search.id = 'catalog-search';
  search.placeholder = 'Try music, painting, photography…';
  const parent = parentOptions(ctx.store.getState(), ctx.ui.focusId);
  const filters = el('div', 'catalog-filters');
  filters.append(field('Add to', parent), field('Search the catalog', search));
  const location = el('div', 'catalog-location');
  const feedback = el('p', 'catalog-feedback'); feedback.setAttribute('role', 'status');
  const results = el('div', 'catalog-results');
  modal.body.append(el('p', 'muted', 'Categories, hobbies, and the smaller things inside them, from Aficion. Adding an item brings its subcategories too. Open an added category to choose the hobbies still missing from your wheel.'), filters, location, feedback, results);
  let browseId = null;
  const draw = () => {
    const query = search.value.trim();
    location.replaceChildren();
    if (!query) {
      const root = button('All categories', null, 'btn btn--quiet');
      root.addEventListener('click', () => { browseId = null; draw(); });
      location.append(root);
      catalogPath(ctx.catalog, browseId).forEach((node) => {
        location.append(el('span', 'muted', '/'));
        const link = button(node.label, null, 'btn btn--quiet');
        link.addEventListener('click', () => { browseId = node.id; draw(); });
        location.append(link);
      });
    }
    const nodes = query ? searchCatalog(ctx.catalog, query) : (browseId ? ctx.catalog.nodes[browseId].children : ctx.catalog.roots).map((id) => ctx.catalog.nodes[id]);
    results.replaceChildren();
    if (!nodes.length) results.append(el('p', 'empty-state muted', 'No matches. Try another word, or create your own hobby from the wheel editor.'));
    nodes.slice(0, 100).forEach((node) => {
      const row = el('div', 'catalog-row');
      const text = el('div', 'catalog-name'); text.append(el('strong', '', node.label));
      const path = catalogPath(ctx.catalog, node.id).slice(0, -1).map((item) => item.label).join(' / ');
      if (path) text.append(el('span', 'muted', path));
      const controls = el('div', 'button-row');
      if (node.children.length) {
        const explore = button('Look inside', null, 'btn btn--quiet');
        explore.setAttribute('aria-label', `Look inside ${node.label}`);
        explore.addEventListener('click', () => { browseId = node.id; search.value = ''; draw(); });
        controls.append(explore);
      }
      const selected = Boolean(ctx.store.getState().nodes[node.id]);
      const add = button(selected ? 'Added' : 'Add', null, 'btn btn--secondary');
      add.disabled = selected; add.setAttribute('aria-label', `${selected ? 'Already added' : 'Add'} ${node.label}`);
      add.addEventListener('click', () => {
        const result = ctx.dispatch({ type: 'addCatalog', id: node.id, parentId: parent.value || null });
        if (!result.ok) modal.fail(`${result.error} Try “Look inside” to add individual hobbies that are not already on your wheel.`);
        else { feedback.textContent = `Added ${node.label}.`; draw(); }
      });
      controls.append(add); row.append(iconBadge(node), text, controls); results.append(row);
    });
    if (nodes.length > 100) results.append(el('p', 'muted', `Showing 100 of ${nodes.length} matches. Add another word to narrow the list.`));
  };
  search.addEventListener('input', draw); draw(); modal.show(); search.focus();
}

export function openEditor(ctx, id = null) {
  const state = ctx.store.getState(); const node = state.nodes[id];
  const modal = dialogShell(node ? 'Make it yours' : 'Create a hobby');
  const form = el('form', 'form-stack');
  const name = el('input'); name.id = 'edit-name'; name.required = true; name.maxLength = 80;
  name.value = node?.label || ''; name.placeholder = 'Something you enjoy';
  const icon = el('select'); icon.id = 'edit-icon';
  ICONS.forEach((item) => icon.append(option(item.label, item.id))); icon.value = node?.icon || 'hobby';
  const color = el('input'); color.type = 'color'; color.id = 'edit-color'; color.value = node?.color || '#fca5a5';
  const hex = el('input'); hex.id = 'edit-hex'; hex.value = color.value; hex.pattern = '#[0-9a-fA-F]{6}'; hex.maxLength = 7; hex.required = true;
  const preview = el('div', 'editor-preview');
  const previewUpdate = () => { preview.replaceChildren(iconBadge({ color: color.value, icon: icon.value }, 32), el('span', '', name.value || 'Your hobby')); };
  icon.addEventListener('change', previewUpdate); name.addEventListener('input', previewUpdate);
  color.addEventListener('input', () => { hex.value = color.value; previewUpdate(); });
  hex.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) { color.value = hex.value; previewUpdate(); } });
  const appearance = el('div', 'appearance-fields');
  appearance.append(field('Icon', icon), field('Color', color), field('Hex color', hex));
  const parent = !node ? parentOptions(state, ctx.ui.focusId) : null;
  form.append(field('Name', name), appearance, preview);
  if (parent) form.append(field('Add to', parent));
  if (node) form.append(el('p', 'field-hint', 'Changes apply to your wheel. Earlier check-ins keep their original names and colors.'));
  const save = button(node ? 'Save changes' : 'Add hobby', null, 'btn btn--primary'); save.type = 'submit'; form.append(save);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = { label: name.value.trim(), icon: icon.value, color: hex.value };
    const action = node ? { type: 'editNode', id, ...fields } : { type: 'addCustom', parentId: parent.value || null, ...fields };
    const result = ctx.dispatch(action);
    if (!result.ok) modal.fail(result.error);
    else { announce(node ? 'Your hobby has a new look.' : 'Your hobby was added to the wheel.'); modal.close(); }
  });
  if (node) {
    const remove = button('Remove from wheel', null, 'btn btn--danger');
    remove.addEventListener('click', () => confirmAction({
      title: `Remove ${node.label}?`,
      description: 'This removes this hobby and its subcategories from your wheel. Your current hobby and every past check-in keep their saved names, colors, and notes.',
      label: 'Remove from wheel', danger: true,
      onConfirm: () => { const result = ctx.dispatch({ type: 'removeNode', id }); if (result.ok) modal.close(); return result; },
    })); modal.footer.append(remove);
  }
  modal.body.append(form); previewUpdate(); modal.show(); name.focus();
}

export function openShare(ctx) {
  const state = ctx.store.getState(); const modal = dialogShell('A small update, in your words');
  const latestNote = [...state.journal].reverse().find((entry) => entry.note)?.note;
  const include = el('input'); include.type = 'checkbox'; include.id = 'share-include-note'; include.disabled = !latestNote;
  const optIn = el('label', 'checkbox-label'); optIn.htmlFor = include.id;
  optIn.append(include, document.createTextNode('Include my latest note'));
  const preview = el('textarea', 'share-preview'); preview.id = 'share-preview'; preview.readOnly = true; preview.rows = 7;
  const message = el('p', 'field-hint'); message.setAttribute('role', 'status');
  const update = () => {
    const recorded = state.current || state.journal.length;
    const text = recorded ? [`Currently: ${state.current?.label || 'Resting'}`, `Feeling: ${moodLabel(state.mood)}`, state.locked ? 'Staying with this for now.' : 'Open to a change.'] : ['I’m making a little room for my changing interests.'];
    if (include.checked && latestNote) text.push('', latestNote);
    preview.value = text.join('\n');
  };
  include.addEventListener('change', update);
  modal.body.append(el('p', 'muted', 'Only the text below will be copied or shared. Your full journal stays here.'), optIn, field('Your update', preview), message);
  const copy = button('Copy update', null, 'btn btn--primary');
  copy.addEventListener('click', async () => {
    const ok = await copyText(preview.value);
    message.textContent = ok ? 'Copied. Share it wherever you like.' : 'Copy is unavailable here. Select the text below and copy it yourself.';
    if (!ok) { preview.focus(); preview.select(); }
  }); modal.footer.append(copy);
  if (navigator.share) {
    const share = button('Share…', null, 'btn btn--secondary');
    share.addEventListener('click', async () => {
      try { await navigator.share({ text: preview.value }); }
      catch (error) { if (error.name !== 'AbortError') message.textContent = 'Sharing is unavailable. You can copy the preview instead.'; }
    }); modal.footer.append(share);
  }
  update(); modal.show();
}

export function openImport(ctx, text) {
  let backup;
  try { backup = JSON.parse(text); } catch { throw new Error('That file is not valid JSON. Choose a Hobby Orbit backup.'); }
  if (backup?.format !== 'hobbyorbit-backup' || backup.version !== 1) throw new Error('Choose a version 1 Hobby Orbit backup. This file has an unsupported format.');
  const valid = validateState(backup.state); if (!valid.ok) throw new Error(valid.error);
  const originals = ctx.store.getRecoveries();
  const preserveConflict = ctx.store.getStatus().mode === 'protected' && originals.length > 1;
  let recoveryContent;
  if (preserveConflict) {
    recoveryContent = el('div', 'form-stack');
    recoveryContent.append(el('h3', '', 'Keep your original files'), el('p', 'muted', 'This device has more than one original. Importing will keep each original unchanged on this device and replace the active wheel and journal with your backup. You can also download separate copies now.'));
    const downloads = el('div', 'button-row');
    originals.forEach((original) => {
      const download = button(`Download: ${original.label}`, null, 'btn btn--secondary');
      download.addEventListener('click', () => downloadText(original.raw, `hobby-orbit-${original.id}.txt`));
      downloads.append(download);
    });
    recoveryContent.append(downloads);
  }
  confirmAction({
    title: 'Replace this device’s wheel and journal?',
    description: `This backup contains ${Object.keys(backup.state.nodes).length} hobbies and ${backup.state.journal.length} journal entries. Importing replaces what is here now. Download a backup first if you want to keep both.`,
    content: recoveryContent,
    label: preserveConflict ? 'Keep originals and import' : 'Replace and import', danger: true,
    onConfirm: () => {
      const result = preserveConflict ? ctx.store.importBackup(text, { preserveConflictingRecovery: true }) : ctx.store.importBackup(text);
      if (result.ok) {
        ctx.ui.focusId = null; ctx.ui.selectedId = null; ctx.resetDraft(); ctx.refresh();
        announce(result.saved ? 'Your backup was imported and saved.' : 'Imported for this session. Download a backup to keep your changes.');
      }
      return result;
    },
  });
}

export function openLock(ctx) {
  const state = ctx.store.getState(); const modal = dialogShell(state.locked ? 'Ready for a little change?' : 'Stay with this for now');
  const form = el('form', 'form-stack');
  const trigger = el('input'); trigger.id = 'lock-trigger'; trigger.maxLength = 120; trigger.setAttribute('list', 'lock-trigger-options'); trigger.placeholder = 'What prompted this?';
  const suggestions = el('datalist'); suggestions.id = 'lock-trigger-options'; TRIGGERS.forEach((value) => suggestions.append(option(value, value)));
  const note = el('textarea'); note.id = 'lock-note'; note.maxLength = 4000; note.rows = 3;
  form.append(el('p', 'muted', state.locked ? 'Unlocking lets you check in with another hobby or rest. Your current hobby stays until you choose a new one.' : 'The wheel stays open to explore. Checking in with a different hobby or rest will ask you to unlock first.'), field('A trigger, if there is one', trigger), suggestions, field('A note, if you want', note));
  const submit = button(state.locked ? 'Unlock current hobby' : 'Stay with this hobby', null, 'btn btn--primary'); submit.type = 'submit'; form.append(submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = ctx.dispatch({ type: 'setLock', locked: !state.locked, trigger: trigger.value, note: note.value });
    if (!result.ok) modal.fail(result.error);
    else { announce(state.locked ? 'You are open to a change. Your current hobby is still here.' : 'Your current hobby is locked in.'); modal.close(); }
  }); modal.body.append(form); modal.show();
}
