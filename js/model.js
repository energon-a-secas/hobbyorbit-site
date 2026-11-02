import { MOODS, TRIGGERS, STARTER_IDS } from './model-constants.js';
import {
  assertState, cloneData, exactFields, requireValue, identifier, upgradeState, SCHEMA,
  displayFields, moodField, textField, booleanField, validateSettings, instant, level, demandField, localDateOf,
} from './model-validation.js';
export { MOODS, TRIGGERS };
export { summarize } from './model-summary.js';

const actionFields = {
  addCatalog: ['type', 'id', 'parentId'],
  addCustom: ['type', 'label', 'icon', 'color', 'parentId'],
  editNode: ['type', 'id', 'label', 'icon', 'color'],
  moveNode: ['type', 'id', 'direction'],
  removeNode: ['type', 'id'],
  checkin: ['type', 'nodeId', 'mood', 'trigger', 'note'],
  setLock: ['type', 'locked', 'trigger', 'note'],
  settings: ['type', 'hemisphere', 'motion', 'reserves'],
  deleteEntry: ['type', 'id'],
  reserve: ['type', 'energy', 'willpower', 'flow', 'demand'],
  deleteReserve: ['type', 'id'],
};

function nodeSnapshot(node) {
  return { id: node.id, label: node.label, icon: node.icon, color: node.color };
}

function requireNode(state, id) {
  identifier(id, 'Hobby ID');
  requireValue(Object.hasOwn(state.nodes, id), 'That hobby is no longer on your wheel.');
  return state.nodes[id];
}

function childrenAt(state, parentId) {
  return parentId === null ? state.rootIds : requireNode(state, parentId).children;
}

function copySubtree(catalog, id, into) {
  requireValue(Object.hasOwn(catalog.nodes, id), 'That hobby is not in the catalog.');
  const pending = [id];
  while (pending.length) {
    const nextId = pending.pop();
    requireValue(!Object.hasOwn(into, nextId),
      `“${catalog.nodes[nextId].label}” is already on your wheel. Remove it before adding this group.`);
    const node = cloneData(catalog.nodes[nextId]);
    Object.defineProperty(into, nextId, { value: node, writable: true, enumerable: true, configurable: true });
    for (const child of node.children) pending.push(child);
  }
}

/** hemisphere is only a default for a new wheel, such as the device's time-zone match. */
export function createInitialState(catalog, hemisphere = 'north') {
  const nodes = Object.create(null);
  for (const id of STARTER_IDS) {
    requireValue(Object.hasOwn(catalog.nodes, id), `The catalog is missing starter category ${id}.`);
    const root = cloneData(catalog.nodes[id]);
    root.children = root.children.slice(0, 3);
    nodes[id] = root;
    for (const child of root.children) copySubtree(catalog, child, nodes);
  }
  const state = { schema: SCHEMA, starter: true, nodes, rootIds: [...STARTER_IDS],
    current: null, currentSince: null, mood: 'curious', locked: false, journal: [], reserves: [],
    settings: { hemisphere, motion: 'system', reserves: 'show' } };
  assertState(state);
  return state;
}

export function validateState(value) {
  try {
    const state = upgradeState(value);
    assertState(state);
    return { ok: true, state: cloneData(state) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The data could not be validated.' };
  }
}

export function getNodePath(state, id) {
  if (typeof id !== 'string' || !Object.hasOwn(state.nodes, id)) return [];
  const pending = state.rootIds.map(rootId => [rootId]);
  while (pending.length) {
    const path = pending.pop();
    const node = state.nodes[path[path.length - 1]];
    if (node.id === id) return path.map(part => state.nodes[part]);
    for (const child of node.children) pending.push([...path, child]);
  }
  return [];
}

function uniqueId(prefix, exists) {
  requireValue(typeof globalThis.crypto?.randomUUID === 'function',
    'This browser cannot create a secure ID. Open Hobby Orbit over HTTPS or localhost.');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = `${prefix}.${globalThis.crypto.randomUUID()}`;
    if (!exists(id)) return id;
  }
  throw new Error('Could not create a unique ID. Please try again.');
}

// A record's UTC instant and the local calendar date it was made on, never earlier than the last record.
function stamp(now, previous, message) {
  requireValue(now instanceof Date && Number.isFinite(now.getTime()), 'The device date and time are invalid.');
  const at = now.toISOString();
  instant(at);
  requireValue(!previous || Date.parse(at) >= Date.parse(previous.at), message);
  return { at, localDate: localDateOf(now) };
}

function addEntry(state, action, kind, previousId, now) {
  const { at, localDate } = stamp(now, state.journal.at(-1),
    'The device clock is earlier than the latest journal entry. Correct it before checking in.');
  const ids = new Set(state.journal.map(entry => entry.id));
  state.journal.push({ id: uniqueId('entry', id => ids.has(id)), at, localDate, kind,
    hobby: state.current && nodeSnapshot(state.current), previousId,
    mood: state.mood, trigger: action.trigger, note: action.note, locked: state.locked });
}

function checkin(state, action, now) {
  moodField(action.mood);
  textField(action.trigger, 'Trigger', 0, 120);
  textField(action.note, 'Note', 0, 4000);
  let next = null;
  if (action.nodeId !== null) {
    identifier(action.nodeId, 'Hobby ID');
    if (Object.hasOwn(state.nodes, action.nodeId)) next = nodeSnapshot(state.nodes[action.nodeId]);
    else if (state.current?.id === action.nodeId) next = nodeSnapshot(state.current);
    else throw new Error('That hobby is no longer on your wheel. Choose an available hobby.');
  }
  const previousId = state.current?.id ?? null;
  const changed = previousId !== (next?.id ?? null);
  requireValue(!state.locked || !changed, 'Unlock your current hobby before switching or resting.');
  state.current = next;
  state.currentSince = next ? (changed ? now.toISOString() : state.currentSince) : null;
  state.mood = action.mood;
  addEntry(state, action, 'checkin', previousId, now);
}

function modifyTree(state, action, catalog) {
  if (action.type === 'addCatalog') {
    identifier(action.id, 'Catalog hobby ID');
    const siblings = childrenAt(state, action.parentId);
    copySubtree(catalog, action.id, state.nodes);
    siblings.push(action.id);
  } else if (action.type === 'addCustom') {
    const siblings = childrenAt(state, action.parentId);
    const id = uniqueId('custom', candidate => Object.hasOwn(state.nodes, candidate));
    const node = { id, label: action.label, icon: action.icon, color: action.color,
      children: [], sourceId: null };
    displayFields(node, 'Hobby');
    state.nodes[id] = node;
    siblings.push(id);
  } else if (action.type === 'editNode') {
    const node = requireNode(state, action.id);
    const fields = { id: action.id, label: action.label, icon: action.icon, color: action.color };
    displayFields(fields, 'Hobby');
    Object.assign(node, fields);
  } else {
    requireNode(state, action.id);
    const path = getNodePath(state, action.id);
    const siblings = path.length === 1 ? state.rootIds : path[path.length - 2].children;
    const index = siblings.indexOf(action.id);
    if (action.type === 'moveNode') {
      requireValue(action.direction === -1 || action.direction === 1, 'Move direction must be up or down.');
      const target = index + action.direction;
      if (target < 0 || target >= siblings.length) return;
      [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
    } else {
      siblings.splice(index, 1);
      const pending = [action.id];
      while (pending.length) {
        const id = pending.pop();
        for (const child of state.nodes[id].children) pending.push(child);
        delete state.nodes[id];
      }
    }
  }
  state.starter = false;
}

export function applyAction(state, action, catalog, now = new Date()) {
  assertState(state);
  requireValue(action !== null && typeof action === 'object' && Object.hasOwn(actionFields, action.type),
    'That action is not supported.');
  exactFields(action, actionFields[action.type], 'Action');
  const next = cloneData(state);
  if (['addCatalog', 'addCustom', 'editNode', 'moveNode', 'removeNode'].includes(action.type)) {
    modifyTree(next, action, catalog);
  } else if (action.type === 'checkin') {
    requireValue(now instanceof Date && Number.isFinite(now.getTime()), 'The device date and time are invalid.');
    checkin(next, action, now);
  } else if (action.type === 'setLock') {
    booleanField(action.locked, 'Lock');
    textField(action.trigger, 'Trigger', 0, 120);
    textField(action.note, 'Note', 0, 4000);
    if (next.locked !== action.locked) {
      requireValue(next.current !== null, 'Choose a current hobby before locking it.');
      next.locked = action.locked;
      addEntry(next, action, action.locked ? 'lock' : 'unlock', next.current.id, now);
    }
  } else if (action.type === 'settings') {
    const settings = { hemisphere: action.hemisphere, motion: action.motion, reserves: action.reserves };
    validateSettings(settings);
    next.settings = settings;
  } else if (action.type === 'reserve') {
    // A reading stands alone: it never changes current activity or adds a journal entry.
    level(action.energy, 'Energy'); level(action.willpower, 'Willpower'); level(action.flow, 'Flow');
    demandField(action.demand);
    const { at, localDate } = stamp(now, next.reserves.at(-1),
      'The device clock is earlier than your latest reserves reading. Correct it before saving.');
    const ids = new Set(next.reserves.map(reading => reading.id));
    next.reserves.push({ id: uniqueId('reserve', id => ids.has(id)), at, localDate,
      energy: action.energy, willpower: action.willpower, flow: action.flow, demand: action.demand });
  } else if (action.type === 'deleteReserve') {
    identifier(action.id, 'Reserves reading ID');
    const index = next.reserves.findIndex(reading => reading.id === action.id);
    requireValue(index !== -1, 'That reading no longer exists.');
    next.reserves.splice(index, 1);
  } else if (action.type === 'deleteEntry') {
    identifier(action.id, 'Journal entry ID');
    const index = next.journal.findIndex(entry => entry.id === action.id);
    requireValue(index !== -1, 'That journal entry no longer exists.');
    next.journal.splice(index, 1);
  }
  assertState(next);
  return next;
}
