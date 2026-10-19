import { getNodePath, summarize } from './model.js';
import { byId, el, button, iconBadge, dateLabel, moodLabel, emptyState } from './ui-dom.js';

export function renderCurrent(state) {
  const region = byId('current-state');
  const label = el('p', 'eyebrow', 'Right now');
  const title = el('div', 'current-heading');
  const hasRecord = state.journal.length > 0 || Boolean(state.current);
  byId('current-jump-label').textContent = state.current?.label || (hasRecord ? 'Taking a rest' : 'No hobby recorded yet');
  byId('current-jump-feeling').textContent = hasRecord ? `${moodLabel(state.mood)}${state.locked ? ' · Locked in' : ''}` : '';
  title.append(iconBadge(state.current, 28), el('h3', '', state.current?.label || (hasRecord ? 'Taking a rest' : 'A little room to begin')));
  const meta = el('p', 'current-meta', hasRecord ? moodLabel(state.mood) : 'No hobby recorded yet.');
  if (state.currentSince) meta.append(el('span', '', `Since ${dateLabel(state.currentSince, false)}`));
  const actions = el('div', 'button-row current-actions');
  if (state.current) {
    const lock = button(state.locked ? 'Unlock current hobby' : 'Stay with this hobby', 'toggle-lock', 'btn btn--quiet');
    lock.setAttribute('aria-pressed', String(state.locked));
    actions.append(lock);
  }
  if (hasRecord) actions.append(button('Share update', 'share', 'btn btn--quiet'));
  region.replaceChildren(label, title, meta);
  if (state.locked) region.append(el('p', 'lock-note', 'Locked in. You can explore freely; unlock when you want to change.'));
  if (state.current && !state.nodes[state.current.id]) region.append(el('p', 'field-hint', 'Removed from your wheel. This current hobby and its history are still here.'));
  if (actions.children.length) region.append(actions);
}

export function renderManager(state, ui) {
  const focus = state.nodes[ui.focusId];
  const location = byId('manager-location');
  location.replaceChildren(el('h4', '', focus ? `Inside ${focus.label}` : 'Your main categories'));
  if (focus) location.append(button('Back to all categories', 'focus', 'btn btn--quiet', ''));
  const ids = focus ? focus.children : state.rootIds;
  const list = byId('manager-list');
  list.replaceChildren();
  if (!ids.length) {
    list.append(emptyState('An open space', 'Browse the catalog or create a hobby to add the first slice.'));
    return;
  }
  ids.forEach((id, index) => {
    const node = state.nodes[id];
    const item = el('li', 'manager-row');
    item.dataset.nodeId = id;
    item.draggable = true;
    const sequence = el('span', 'order-number', String(index + 1).padStart(2, '0'));
    sequence.setAttribute('aria-hidden', 'true');
    const name = el('div', 'manager-name');
    name.append(el('strong', '', node.label), el('span', 'muted', node.children.length ? `${node.children.length} inside` : 'No subcategories yet'));
    const controls = el('div', 'manager-controls');
    const up = button('↑', 'move-up', 'btn btn--icon btn--quiet', id);
    const down = button('↓', 'move-down', 'btn btn--icon btn--quiet', id);
    up.disabled = index === 0;
    down.disabled = index === ids.length - 1;
    up.setAttribute('aria-label', `Move ${node.label} up`);
    down.setAttribute('aria-label', `Move ${node.label} down`);
    const explore = button('Open', 'focus', 'btn btn--quiet', id);
    explore.setAttribute('aria-label', `Manage subcategories of ${node.label}`);
    const edit = button('Edit', 'edit-node', 'btn btn--quiet', id);
    edit.setAttribute('aria-label', `Edit ${node.label}`);
    controls.append(up, down, explore, edit);
    item.append(sequence, iconBadge(node), name, controls);
    list.append(item);
  });
}

export function renderJournal(state) {
  byId('journal-count').textContent = String(state.journal.length);
  const region = byId('journal-list');
  region.replaceChildren();
  if (!state.journal.length) {
    region.append(emptyState('A blank page is a good start.', 'Your first check-in will appear here. Record a hobby, a feeling, or a moment of rest whenever you want.', button('Make a check-in', 'go-checkin', 'btn btn--primary')));
    return;
  }
  const list = el('ol', 'journal-list');
  [...state.journal].reverse().forEach((entry) => {
    const item = el('li', 'journal-entry');
    const content = el('div', 'journal-body');
    const heading = el('div', 'journal-heading');
    const title = entry.kind === 'lock' ? `Staying with ${entry.hobby?.label}` : entry.kind === 'unlock' ? `Opening up from ${entry.hobby?.label}` : entry.hobby?.label || 'Rest';
    heading.append(el('h3', '', title));
    const time = el('time', 'muted', dateLabel(entry.at));
    time.dateTime = entry.at;
    content.append(heading, time);
    const tags = el('div', 'journal-tags');
    tags.append(el('span', 'tag', entry.kind === 'checkin' ? moodLabel(entry.mood) : entry.kind === 'lock' ? 'Locked in' : 'Unlocked'));
    if (entry.trigger) tags.append(el('span', 'trigger-tag', entry.trigger));
    content.append(tags);
    if (entry.note) content.append(el('p', 'journal-note', entry.note));
    const remove = button('Delete', 'delete-entry', 'btn btn--quiet journal-delete', entry.id);
    remove.setAttribute('aria-label', `Delete ${entry.kind} for ${entry.hobby?.label || 'rest'} from ${dateLabel(entry.at)}`);
    item.append(iconBadge(entry.hobby), content, remove);
    list.append(item);
  });
  region.append(list);
}

function observations(title, values, empty, formatter = (value) => value.label) {
  const region = el('section', 'observation-section');
  region.append(el('h3', '', title));
  if (!values.length) region.append(el('p', 'muted', empty));
  else {
    const list = el('ul', 'observation-list');
    values.forEach((value) => {
      const row = el('li');
      row.append(el('span', '', formatter(value)), el('strong', '', String(value.count)));
      list.append(row);
    });
    region.append(list);
  }
  return region;
}

export function renderPatterns(state) {
  const data = summarize(state);
  const region = byId('patterns-content');
  region.replaceChildren();
  if (!data.checkins) {
    region.append(emptyState('Let a few moments collect.', 'As you check in, this space will show your recorded sequence, feelings, and triggers. There is no schedule to keep.', button('Make a check-in', 'go-checkin', 'btn btn--primary')));
    return;
  }
  const count = el('p', 'pattern-summary');
  count.append(el('strong', '', `${data.checkins} ${data.checkins === 1 ? 'check-in' : 'check-ins'}`), document.createTextNode(` · ${data.switches} ${data.switches === 1 ? 'change' : 'changes'} between hobbies or rest`));
  const sequence = el('section', 'sequence-section');
  sequence.append(el('h3', '', 'Your recent path'), el('p', 'muted', 'The last eight recorded stops. Repeated check-ins with the same hobby share a stop.'));
  const stops = el('ol', 'sequence-list');
  data.recentSequence.forEach((entry) => {
    const stop = el('li');
    stop.append(el('strong', '', entry.label), el('span', 'muted', dateLabel(entry.at, false)));
    stops.append(stop);
  });
  sequence.append(stops);
  const grid = el('div', 'observations-grid');
  grid.append(
    observations('Feelings you recorded', data.moods, 'No feelings recorded.', (item) => moodLabel(item.id)),
    observations('Things you mentioned', data.triggers, 'Add a trigger to a check-in when something stands out.'),
    observations('Changes you recorded', data.transitions, 'A second different hobby or rest will begin this list.', (item) => `${item.from} → ${item.to}`),
    observations(`Seasons · ${state.settings.hemisphere === 'south' ? 'Southern' : 'Northern'} hemisphere`, data.seasons, 'No seasonal records yet.'),
  );
  region.append(count, sequence, grid, el('p', 'patterns-footnote muted', 'Counts describe what you recorded, not why it happened or what comes next. Trigger counts include lock and unlock notes. Seasons follow the local date recorded with each check-in.'));
}

export function renderStorage(store) {
  const status = store.getStatus();
  const originals = store.getRecoveries();
  const recoveryButtons = () => originals.map((original) => {
    const download = button(`Download: ${original.label}`, 'recovery', 'btn btn--secondary');
    download.dataset.recoveryId = original.id;
    return download;
  });
  const notice = byId('storage-notice');
  byId('save-indicator').textContent = status.mode === 'saved' ? 'Saved on this device' : 'This session only';
  byId('save-indicator').classList.toggle('is-warning', status.mode !== 'saved');
  notice.hidden = status.mode === 'saved';
  notice.replaceChildren(el('p', '', status.message));
  if (status.mode !== 'saved') notice.append(button('Keep a backup', 'export', 'btn btn--secondary'));
  notice.append(...recoveryButtons());
  const recovery = byId('recovery-section');
  recovery.hidden = originals.length === 0;
  const description = el('p', '', originals.length > 1 ? 'Each original file is preserved unchanged. Download a separate copy of any file you want to keep outside this browser.' : 'Your original stored data is preserved unchanged. Download a separate copy to keep it outside this browser.');
  description.id = 'recovery-description';
  recovery.replaceChildren(el('h4', '', 'Original data preserved'), description, ...recoveryButtons());
}

export function renderBreadcrumb(state, ui) {
  const region = byId('wheel-breadcrumb');
  region.replaceChildren();
  const path = getNodePath(state, ui.focusId);
  if (!path.length) return;
  region.append(button('All hobbies', 'focus', 'btn btn--quiet', ''));
  path.forEach((node, index) => {
    const separator = el('span', 'breadcrumb-divider', '/');
    separator.setAttribute('aria-hidden', 'true');
    const crumb = button(node.label, 'focus', 'btn btn--quiet', node.id);
    if (index === path.length - 1) crumb.setAttribute('aria-current', 'location');
    region.append(separator, crumb);
  });
}
