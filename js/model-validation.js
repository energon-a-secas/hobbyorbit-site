import { ICON_KEYS, MOODS } from './model-constants.js';

const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);
const iconKeys = new Set(ICON_KEYS);
const moodKeys = new Set(MOODS.map(mood => mood.id));
const nodeFields = ['id', 'label', 'icon', 'color', 'children', 'sourceId'];
const snapshotFields = ['id', 'label', 'icon', 'color'];
const entryFields = ['id', 'at', 'localDate', 'kind', 'hobby', 'previousId',
  'mood', 'trigger', 'note', 'locked'];
const stateFields = ['schema', 'starter', 'nodes', 'rootIds', 'current',
  'currentSince', 'mood', 'locked', 'journal', 'settings'];

export function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export function plainObject(value, name) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value),
    `${name} must be an object.`);
  const proto = Object.getPrototypeOf(value);
  requireValue(proto === Object.prototype || proto === null, `${name} must contain plain data.`);
  for (const key of Reflect.ownKeys(value)) {
    requireValue(typeof key === 'string' && !unsafeKeys.has(key), `${name} contains an unsafe field.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireValue(descriptor && 'value' in descriptor && descriptor.enumerable,
      `${name} must contain plain data fields.`);
  }
}

export function exactFields(value, fields, name) {
  plainObject(value, name);
  const keys = Object.keys(value);
  requireValue(keys.length === fields.length && keys.every(key => fields.includes(key)),
    `${name} has missing or unsupported fields.`);
}

export function textField(value, name, min, max, trimmed = false) {
  requireValue(typeof value === 'string' && value.length >= min && value.length <= max,
    `${name} must contain ${min ? `${min}–` : 'at most '}${max} characters.`);
  if (trimmed) requireValue(value === value.trim(), `${name} must not start or end with whitespace.`);
}

export function identifier(value, name = 'ID') {
  textField(value, name, 1, 120, true);
  requireValue(!unsafeKeys.has(value) && !/[\u0000-\u001f\u007f]/u.test(value), `${name} is not a safe ID.`);
}

export function booleanField(value, name) {
  requireValue(typeof value === 'boolean', `${name} must be true or false.`);
}

export function moodField(value) {
  requireValue(moodKeys.has(value), 'Choose a supported mood.');
}

export function displayFields(value, name) {
  identifier(value.id, `${name} ID`);
  textField(value.label, `${name} name`, 1, 80, true);
  requireValue(iconKeys.has(value.icon), `${name} has an unsupported icon.`);
  requireValue(typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color),
    `${name} color must use six hexadecimal digits, such as #fca5a5.`);
}

export function snapshot(value, name = 'Hobby snapshot') {
  if (value === null) return;
  exactFields(value, snapshotFields, name);
  displayFields(value, name);
}

export function localDate(value, name = 'Local date') {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value),
    `${name} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  requireValue(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value,
    `${name} is not a real calendar date.`);
}

export function instant(value, name = 'Timestamp') {
  requireValue(typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value),
  `${name} must be an ISO UTC timestamp.`);
  const date = new Date(value);
  requireValue(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19),
    `${name} is not a real date and time.`);
}

function arrayField(value, name) {
  requireValue(Array.isArray(value), `${name} must be an array.`);
  requireValue(Object.getPrototypeOf(value) === Array.prototype, `${name} must contain plain data.`);
  const keys = Object.keys(value);
  requireValue(keys.length === value.length && keys.every((key, index) => key === String(index)),
    `${name} has missing items or unsupported fields.`);
  for (const key of keys) {
    requireValue('value' in Object.getOwnPropertyDescriptor(value, key), `${name} must contain plain data.`);
  }
}

function idList(value, name) {
  arrayField(value, name);
  const seen = new Set();
  for (const id of value) {
    identifier(id, `${name} item`);
    requireValue(!seen.has(id), `${name} contains a duplicate hobby.`);
    seen.add(id);
  }
}

export function validateTree(nodes, rootIds) {
  plainObject(nodes, 'Hobby map');
  idList(rootIds, 'Root order');
  for (const [id, node] of Object.entries(nodes)) {
    identifier(id);
    exactFields(node, nodeFields, 'Hobby');
    displayFields(node, 'Hobby');
    requireValue(node.id === id, 'A hobby ID does not match its map key.');
    if (node.sourceId !== null) identifier(node.sourceId, 'Source ID');
    idList(node.children, `Children of ${node.label}`);
  }
  const visited = new Set();
  const pending = rootIds.map(id => ({ id, depth: 1 }));
  while (pending.length) {
    const { id, depth } = pending.pop();
    requireValue(Object.hasOwn(nodes, id), `The wheel refers to a missing hobby: ${id}.`);
    requireValue(depth <= 4, 'Hobbies can be nested up to four levels, including the root.');
    requireValue(!visited.has(id), 'A hobby appears more than once, or the wheel contains a cycle.');
    visited.add(id);
    for (const child of nodes[id].children) pending.push({ id: child, depth: depth + 1 });
  }
  requireValue(visited.size === Object.keys(nodes).length, 'The wheel contains an unattached hobby or cycle.');
}

export function validateSettings(settings) {
  exactFields(settings, ['hemisphere', 'motion'], 'Settings');
  requireValue(['south', 'north'].includes(settings.hemisphere), 'Choose a northern or southern hemisphere.');
  requireValue(['system', 'reduce'].includes(settings.motion), 'Choose a supported motion setting.');
}

function validateJournal(journal) {
  arrayField(journal, 'Journal');
  const ids = new Set();
  let previousTime = -Infinity;
  for (const entry of journal) {
    exactFields(entry, entryFields, 'Journal entry');
    identifier(entry.id, 'Journal entry ID');
    requireValue(!ids.has(entry.id), 'Journal entry IDs must be unique.');
    ids.add(entry.id);
    instant(entry.at, 'Journal time');
    localDate(entry.localDate);
    const time = Date.parse(entry.at);
    requireValue(time >= previousTime, 'Journal entries must be in their recorded chronological order.');
    previousTime = time;
    requireValue(['checkin', 'lock', 'unlock'].includes(entry.kind), 'Journal entry has an unsupported kind.');
    snapshot(entry.hobby);
    if (entry.previousId !== null) identifier(entry.previousId, 'Previous hobby ID');
    moodField(entry.mood);
    textField(entry.trigger, 'Trigger', 0, 120);
    textField(entry.note, 'Note', 0, 4000);
    booleanField(entry.locked, 'Journal lock');
    requireValue(!entry.locked || entry.hobby !== null, 'A locked journal entry must have a hobby.');
    if (entry.kind !== 'checkin') {
      requireValue(entry.hobby !== null, 'A lock change must have a hobby.');
      requireValue(entry.locked === (entry.kind === 'lock'), 'Journal lock status does not match its kind.');
    }
  }
}

export function assertState(value) {
  plainObject(value, 'Saved data');
  requireValue(value.schema === 1, 'Unsupported data schema. Keep the original backup.');
  exactFields(value, stateFields, 'Saved data');
  booleanField(value.starter, 'Starter flag');
  validateTree(value.nodes, value.rootIds);
  snapshot(value.current, 'Current hobby');
  moodField(value.mood);
  booleanField(value.locked, 'Lock');
  if (value.current === null) {
    requireValue(value.currentSince === null && !value.locked, 'Rest cannot have a start time or a lock.');
  } else {
    instant(value.currentSince, 'Current hobby start time');
  }
  validateSettings(value.settings);
  validateJournal(value.journal);
}

export function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

export function freezeData(value) {
  const pending = [value];
  while (pending.length) {
    const item = pending.pop();
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) continue;
    Object.freeze(item);
    for (const child of Object.values(item)) pending.push(child);
  }
  return value;
}
