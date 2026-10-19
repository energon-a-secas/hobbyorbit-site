import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState, validateState, applyAction, getNodePath, summarize } from '../js/model.js';
import { createStore, STORAGE_KEY } from '../js/state.js';
import { loadCatalog, searchCatalog, catalogPath } from '../js/catalog.js';

const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const copy = value => JSON.parse(JSON.stringify(value));
const initial = () => createInitialState(catalog);
const time = new Date('2026-10-19T12:00:00.000Z');
const act = (state, action, at = time) => applyAction(state, action, catalog, at);
const checkin = (nodeId = 'music.synths', extra = {}) => ({
  type: 'checkin', nodeId, mood: 'curious', trigger: '', note: '', ...extra,
});
const lock = locked => ({ type: 'setLock', locked, trigger: '', note: '' });
const custom = parentId => ({ type: 'addCustom', label: 'My activity', icon: 'hobby', color: '#fca5a5', parentId });
const settings = { type: 'settings', hemisphere: 'north', motion: 'reduce' };
const backup = state => JSON.stringify({ format: 'hobbyorbit-backup', version: 1,
  exportedAt: time.toISOString(), state });
const recoveryKey = 'hobbyorbit:recovery';
const archiveKey = 'hobbyorbit:recovery:archive:v1';
const preserve = { preserveConflictingRecovery: true };

function memoryStorage(entries = []) {
  const map = new Map(entries);
  return { map, failRead: false, failWrite: false, failRemove: false, failKey: null,
    getItem(key) {
      if (this.failRead) throw new Error('Storage is blocked.');
      return map.get(key) ?? null;
    },
    setItem(key, value) {
      if (this.failWrite || this.failKey === key) throw new Error('Quota exceeded.');
      map.set(key, value);
    },
    removeItem(key) {
      if (this.failRemove) throw new Error('Removal blocked.');
      map.delete(key);
    },
  };
}

test('catalog preserves complete source membership, order, provenance and nested trees', () => {
  assert.equal(Object.keys(catalog.nodes).length, 531);
  assert.deepEqual(catalog.counts, { categories: 23, hobbies: 330, inner: 178 });
  const source = new URL('../../aficion-site/data/', import.meta.url);
  const atlas = JSON.parse(readFileSync(new URL('atlas.json', source), 'utf8'));
  for (const id of atlas.clusters) {
    const cluster = JSON.parse(readFileSync(new URL(`clusters/${id}.json`, source), 'utf8'));
    const order = cluster.layout.order ?? [];
    assert.deepEqual(catalog.nodes[`category.${id}`].children,
      [...order, ...cluster.nodes.map(node => node.id).filter(nodeId => !order.includes(nodeId))]);
    for (const node of cluster.nodes) {
      assert.equal(catalog.nodes[node.id].label, node.label);
      assert.equal(catalog.nodes[node.id].sourceId, node.id);
    }
  }
  assert.equal(catalog.nodes['core.photography'].children.length, 6);
  assert.equal(catalogPath(catalog, 'core.photography.macro').length, 3);
  assert.deepEqual(catalogPath(catalog, '__proto__'), []);
  assert.ok(searchCatalog(catalog, 'photography').some(node => node.id === 'core.photography.macro'));
  assert.ok(searchCatalog(catalog, 'music').every(node => !node.id.startsWith('category.')));
  assert.equal(searchCatalog(catalog, 'no-such-activity-xyz').length, 0);
});

test('catalog load validates data and reports actionable network and malformed errors', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => copy(catalog) });
    assert.equal(Object.keys((await loadCatalog()).nodes).length, 531);
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(loadCatalog(), /Retry.*503/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
    await assert.rejects(loadCatalog(), /missing or unsupported fields/);
  } finally { globalThis.fetch = originalFetch; }
});

test('catalog timeout aborts a stalled request and clears its timer', async () => {
  const originals = { fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  let abort;
  let cleared = false;
  try {
    globalThis.setTimeout = (fn, milliseconds) => { assert.equal(milliseconds, 10000); abort = fn; return 42; };
    globalThis.clearTimeout = id => { assert.equal(id, 42); cleared = true; };
    globalThis.fetch = async (_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Request timed out.')));
    });
    const pending = loadCatalog();
    abort();
    await assert.rejects(pending, /Retry.*timed out/);
    assert.equal(cleared, true);
  } finally { Object.assign(globalThis, originals); }
});

test('starter is fresh, ordered, contains full inner trees and invents no history', () => {
  const state = initial();
  assert.equal(Object.keys(state.nodes).length, 60);
  assert.equal(state.starter, true);
  assert.equal(state.current, null);
  assert.equal(state.currentSince, null);
  assert.equal(state.locked, false);
  assert.deepEqual(state.journal, []);
  assert.deepEqual(state.settings, { hemisphere: 'south', motion: 'system' });
  for (const id of state.rootIds) {
    assert.deepEqual(state.nodes[id].children, catalog.nodes[id].children.slice(0, 3));
    for (const child of state.nodes[id].children) assert.deepEqual(state.nodes[child], catalog.nodes[child]);
  }
  state.nodes['music.synths'].label = 'Changed here';
  assert.equal(initial().nodes['music.synths'].label, 'Synthesizers');
  assert.equal(catalog.nodes['music.synths'].label, 'Synthesizers');
});

test('check-ins distinguish current, rest, same-hobby moods and immutable snapshots', () => {
  const before = initial();
  const state = act(before, checkin('music.synths', { note: '  Keep my exact note\n', trigger: 'Season changed' }));
  assert.equal(before.journal.length, 0);
  assert.equal(state.journal.length, 1);
  assert.equal(state.currentSince, time.toISOString());
  assert.equal(state.journal[0].note, '  Keep my exact note\n');
  const edit = act(state, { type: 'editNode', id: 'music.synths', label: 'My synth', icon: 'guitar', color: '#ABCDEF' });
  assert.equal(edit.current.label, 'Synthesizers');
  assert.equal(edit.journal[0].hobby.label, 'Synthesizers');
  const repeat = act(edit, checkin('music.synths', { mood: 'not-in-mood' }), new Date('2026-10-20T12:00:00Z'));
  assert.equal(repeat.current.label, 'My synth');
  assert.equal(repeat.currentSince, state.currentSince);
  assert.equal(repeat.journal.length, 2);
  const rest = act(repeat, checkin(null, { mood: 'resting' }), new Date('2026-10-21T12:00:00Z'));
  assert.equal(rest.current, null);
  assert.equal(rest.currentSince, null);
  assert.equal(rest.journal.at(-1).previousId, 'music.synths');
});

test('lock guards switching/rest but keeps same-hobby check-ins after removal usable', () => {
  assert.throws(() => act(initial(), lock(true)), /Choose a current hobby/);
  let state = act(act(initial(), checkin()), lock(true));
  assert.equal(state.journal.length, 2);
  assert.equal(act(state, lock(true)).journal.length, 2);
  assert.throws(() => act(state, checkin('music.modular')), /Unlock/);
  assert.throws(() => act(state, checkin(null)), /Unlock/);
  state = act(state, { type: 'removeNode', id: 'category.music' });
  assert.equal(state.current.id, 'music.synths');
  assert.equal(state.nodes['music.synths'], undefined);
  state = act(state, checkin('music.synths', { mood: 'steady' }));
  assert.equal(state.journal.at(-1).hobby.label, 'Synthesizers');
  state = act(state, lock(false));
  state = act(state, checkin(null, { mood: 'resting' }));
  assert.throws(() => act(state, checkin('music.synths')), /no longer on your wheel/);
  assert.equal(validateState(state).ok, true);
});

test('reorder only changes sibling order; edge moves are no-ops', () => {
  const state = act(initial(), checkin());
  const moved = act(state, { type: 'moveNode', id: 'category.music', direction: 1 });
  assert.deepEqual(moved.rootIds.slice(0, 2), ['category.outdoor', 'category.music']);
  assert.deepEqual(moved.journal, state.journal);
  assert.deepEqual(moved.current, state.current);
  assert.equal(moved.starter, false);
  assert.deepEqual(act(state, { type: 'moveNode', id: 'category.music', direction: -1 }), copy(state));
});

test('custom nodes and catalog subtrees support four levels and reject overlap atomically', () => {
  let state = act(initial(), custom(null));
  const root = state.rootIds.at(-1);
  assert.match(root, /^custom\.[0-9a-f-]{36}$/);
  state = act(state, custom(root));
  const child = state.nodes[root].children[0];
  state = act(state, { type: 'addCatalog', id: 'core.photography', parentId: child });
  assert.equal(getNodePath(state, 'core.photography.macro').length, 4);
  const raw = JSON.stringify(state);
  assert.throws(() => act(state, custom('core.photography.macro')), /four levels/);
  assert.throws(() => act(state, { type: 'addCatalog', id: 'category.core', parentId: null }), /already on your wheel/);
  assert.throws(() => act(state, { type: 'addCatalog', id: 'core.photography', parentId: 'core.photography' }), /already/);
  assert.throws(() => act(state, custom('missing')), /no longer/);
  assert.equal(JSON.stringify(state), raw);
  const removed = act(state, { type: 'removeNode', id: root });
  assert.equal(removed.nodes['core.photography.macro'], undefined);
  assert.deepEqual(getNodePath(removed, root), []);
});

test('journal deletion leaves actual current, start time, and lock unchanged', () => {
  const state = act(act(initial(), checkin()), lock(true));
  const next = act(state, { type: 'deleteEntry', id: state.journal[0].id });
  assert.equal(next.journal.length, 1);
  assert.deepEqual(next.current, state.current);
  assert.equal(next.currentSince, state.currentSince);
  assert.equal(next.locked, true);
  assert.equal(validateState(next).ok, true);
});

test('invalid actions and oversized content fail without trimming or mutation', () => {
  const state = initial();
  const raw = JSON.stringify(state);
  const bad = [checkin('missing'), checkin(undefined, { mood: 'angry' }),
    checkin(undefined, { note: 'x'.repeat(4001) }), checkin(undefined, { trigger: 'x'.repeat(121) }),
    { ...custom(null), label: ' ' }, { ...custom(null), icon: 'remote-svg' },
    { ...custom(null), color: 'red' }, { ...custom(null), label: 'x'.repeat(81) },
    { ...settings, extra: true }, { type: 'spin' }, { type: '__proto__' },
    { type: 'moveNode', id: 'category.music', direction: 0 }];
  for (const action of bad) assert.throws(() => act(state, action));
  assert.equal(JSON.stringify(state), raw);
  assert.equal(act(state, checkin(undefined, { note: 'x'.repeat(4000) })).journal[0].note.length, 4000);
});

test('validation rejects bad structure, enums, dates and unsafe keys without repairing', () => {
  const valid = copy(act(initial(), checkin()));
  const cases = [
    state => { state.schema = 2; }, state => { state.extra = true; },
    state => { state.nodes['music.synths'].label = ' untrimmed'; },
    state => { state.nodes['music.synths'].color = '#fff'; },
    state => { state.rootIds.push(state.rootIds[0]); },
    state => { state.nodes['music.synths'].children.push('category.music'); },
    state => { state.rootIds.pop(); }, state => { state.nodes['music.synths'].children.push('missing'); },
    state => { state.currentSince = null; }, state => { state.current = null; },
    state => { state.journal.push(copy(state.journal[0])); },
    state => { state.journal[0].at = '2026-02-30T00:00:00Z'; },
    state => { state.journal[0].localDate = '2026-02-29'; },
    state => { state.journal[0].kind = 'spin'; }, state => { state.journal[0].mood = 'invalid'; },
    state => { state.journal[0].note = null; }, state => { state.journal[0].kind = 'unlock'; state.journal[0].locked = true; },
    state => { state.nodes.constructor = copy(state.nodes['music.synths']); },
    state => { state.nodes['music.synths'].id = '__proto__'; },
    state => { state.settings.motion = 'fast'; }, state => { state.rootIds.extra = true; },
  ];
  for (const corrupt of cases) {
    const value = copy(valid); corrupt(value);
    const raw = JSON.stringify(value);
    const result = validateState(value);
    assert.equal(result.ok, false, raw);
    assert.equal(typeof result.error, 'string');
    assert.equal(JSON.stringify(value), raw);
  }
  const malicious = JSON.parse(JSON.stringify(valid).replace('"nodes":{', '"nodes":{"__proto__":{},'));
  assert.equal(validateState(malicious).ok, false);
  assert.equal({}.polluted, undefined);
});

test('observations use check-ins, local seasons, stable ties and no causal inference', () => {
  let state = act(initial(), checkin('music.synths', { trigger: 'B', mood: 'steady' }));
  state = act(state, { ...lock(true), trigger: 'A' });
  state = act(state, lock(false));
  state = act(state, checkin('music.modular', { trigger: 'A', mood: 'curious' }));
  state = act(state, checkin('music.modular', { mood: 'curious' }));
  state = act(state, checkin(null, { mood: 'resting' }));
  state.journal.filter(entry => entry.kind === 'checkin').forEach(entry => { entry.localDate = '2026-08-31'; });
  const summary = summarize(state);
  assert.equal(summary.checkins, 4);
  assert.equal(summary.switches, 2);
  assert.deepEqual(summary.transitions, [
    { from: 'Eurorack', to: 'Rest', count: 1 }, { from: 'Synthesizers', to: 'Eurorack', count: 1 },
  ]);
  assert.deepEqual(summary.triggers, [{ label: 'A', count: 2 }, { label: 'B', count: 1 }]);
  assert.deepEqual(summary.seasons, [{ label: 'Winter', count: 4 }]);
  assert.equal(summarize(act(state, settings)).seasons[0].label, 'Summer');
  assert.deepEqual(summary.recentSequence.map(entry => entry.label), ['Synthesizers', 'Eurorack', 'Rest']);
  assert.equal(summary.moods[0].count, 2);
  for (let i = 0; i < 9; i += 1) state = act(state, checkin(null));
  assert.deepEqual(summarize(state).recentSequence.map(entry => entry.label), ['Rest']);
});

test('storage reload and backups retain notes, full history, local dates and settings', () => {
  const storage = memoryStorage();
  const store = createStore(catalog, { storage });
  let calls = 0;
  const unsubscribe = store.subscribe(() => { calls += 1; });
  assert.deepEqual(store.dispatch(checkin(undefined, { note: 'Private\n日本語 🪐', trigger: 'Season changed' })), { ok: true, saved: true });
  store.dispatch(settings);
  unsubscribe();
  store.dispatch(lock(true));
  assert.equal(calls, 2);
  const reloaded = createStore(catalog, { storage });
  assert.deepEqual(reloaded.getState(), store.getState());
  assert.equal(reloaded.getState().journal[0].localDate.length, 10);
  const imported = createStore(catalog, { storage: memoryStorage() });
  assert.deepEqual(imported.importBackup(store.exportBackup()), { ok: true, saved: true });
  assert.deepEqual(imported.getState(), store.getState());
  assert.throws(() => { store.getState().journal.push({}); }, TypeError);
});

test('quota failure keeps session changes, reports memory, exports them and can later save', () => {
  const storage = memoryStorage();
  const store = createStore(catalog, { storage });
  storage.failWrite = true;
  assert.deepEqual(store.dispatch(checkin()), { ok: true, saved: false });
  assert.equal(store.getState().journal.length, 1);
  assert.equal(store.getStatus().mode, 'memory');
  assert.match(store.getStatus().message, /Export a backup/);
  assert.equal(JSON.parse(store.exportBackup()).state.journal.length, 1);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  storage.failWrite = false;
  assert.deepEqual(store.dispatch(settings), { ok: true, saved: true });
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).journal.length, 1);
});

test('default browser adapter safely handles blocked access and write probes', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true,
      get() { throw new Error('Blocked browser storage.'); } });
    const blocked = createStore(catalog);
    assert.equal(blocked.getStatus().mode, 'memory');
    assert.deepEqual(blocked.dispatch(checkin()), { ok: true, saved: false });
    const storage = memoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    const available = createStore(catalog);
    assert.equal(storage.map.size, 0);
    assert.deepEqual(available.dispatch(checkin()), { ok: true, saved: true });
    storage.failWrite = true;
    assert.equal(createStore(catalog).getStatus().mode, 'memory');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('blocked reads never overwrite previously unread personal data when storage returns', () => {
  const original = JSON.stringify(act(initial(), checkin()));
  const storage = memoryStorage([[STORAGE_KEY, original]]);
  storage.failRead = true;
  const store = createStore(catalog, { storage });
  assert.equal(store.getStatus().mode, 'memory');
  assert.deepEqual(store.dispatch(settings), { ok: true, saved: false });
  storage.failRead = false;
  assert.deepEqual(store.dispatch(checkin()), { ok: true, saved: false });
  assert.match(store.getStatus().message, /Another tab/);
  assert.equal(storage.getItem(STORAGE_KEY), original);
});

test('another tab cannot silently overwrite saved changes; explicit import can replace', () => {
  const storage = memoryStorage();
  const first = createStore(catalog, { storage });
  const second = createStore(catalog, { storage });
  first.dispatch(checkin());
  const firstRaw = storage.getItem(STORAGE_KEY);
  assert.deepEqual(second.dispatch(checkin('music.modular')), { ok: true, saved: false });
  assert.equal(second.getState().current.id, 'music.modular');
  assert.equal(storage.getItem(STORAGE_KEY), firstRaw);
  assert.match(second.getStatus().message, /Another tab.*Export.*reload/);
  assert.deepEqual(second.importBackup(second.exportBackup()), { ok: true, saved: true });
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).current.id, 'music.modular');
});

test('malformed, future and failed imports leave primary storage and session unchanged', () => {
  const storage = memoryStorage();
  const store = createStore(catalog, { storage });
  store.dispatch(checkin());
  const raw = storage.getItem(STORAGE_KEY);
  const state = store.getState();
  const bad = ['{', '{}', backup({ ...initial(), schema: 2 }),
    store.exportBackup().replace('"version": 1', '"version": 2')];
  for (const input of bad) {
    assert.equal(store.importBackup(input).ok, false);
    assert.equal(store.getState(), state);
    assert.equal(storage.getItem(STORAGE_KEY), raw);
  }
  storage.failWrite = true;
  assert.equal(store.importBackup(backup(initial())).ok, false);
  assert.equal(store.getState(), state);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});

test('corrupt and future raw data remains protected during session edits and explicit recovery', () => {
  for (const raw of ['{bad JSON', '', JSON.stringify({ schema: 9, important: 'future personal data' })]) {
    const storage = memoryStorage([[STORAGE_KEY, raw]]);
    const store = createStore(catalog, { storage });
    assert.equal(store.getStatus().mode, 'protected');
    assert.equal(store.getRecovery(), raw);
    assert.deepEqual(store.dispatch(checkin()), { ok: true, saved: false });
    assert.equal(storage.getItem(STORAGE_KEY), raw);
    assert.deepEqual(store.importBackup(store.exportBackup()), { ok: true, saved: true });
    assert.equal(storage.getItem(recoveryKey), raw);
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).journal.length, 1);
  }
});

test('protected imports preserve existing recoveries and roll back newly made copies on failure', () => {
  const raw = '{broken';
  const storage = memoryStorage([[STORAGE_KEY, raw], [recoveryKey, 'earlier original']]);
  const store = createStore(catalog, { storage });
  const originalState = store.getState();
  assert.match(store.importBackup(backup(initial())).error, /different recovery/);
  assert.equal(storage.getItem(recoveryKey), 'earlier original');
  storage.map.delete(recoveryKey);
  storage.failKey = recoveryKey;
  assert.equal(store.importBackup(backup(initial())).ok, false);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  storage.failKey = STORAGE_KEY;
  assert.equal(store.importBackup(backup(initial())).ok, false);
  assert.equal(storage.getItem(recoveryKey), null);
  assert.equal(store.getState(), originalState);
  storage.failRemove = true;
  assert.match(store.importBackup(backup(initial())).error, /Recovery rollback could not finish/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.equal(storage.getItem(recoveryKey), raw);
  assert.equal(store.getState(), originalState);
});

test('explicit recovery imports keep distinct originals downloadable across reloads and repeated imports', () => {
  const old = ' Earlier original\n日本語 ';
  const storage = memoryStorage([[STORAGE_KEY, ''], [recoveryKey, old]]);
  const store = createStore(catalog, { storage });
  assert.deepEqual(store.getRecoveries().map(({ id, raw }) => ({ id, raw })),
    [{ id: 'primary', raw: '' }, { id: 'saved', raw: old }]);
  assert.match(store.importBackup(backup(initial())).error, /Keep originals and import/);
  assert.equal(storage.getItem(archiveKey), null);
  assert.deepEqual(store.importBackup(backup(initial()), preserve), { ok: true, saved: true });
  assert.equal(storage.getItem(recoveryKey), old);
  assert.deepEqual(JSON.parse(storage.getItem(archiveKey)).originals, ['']);
  assert.deepEqual(new Set(createStore(catalog, { storage }).getRecoveries().map(file => file.raw)), new Set(['', old]));
  for (const raw of ['new corrupt original', '']) {
    storage.setItem(STORAGE_KEY, raw);
    assert.equal(createStore(catalog, { storage }).importBackup(backup(initial()), preserve).ok, true);
  }
  assert.deepEqual(JSON.parse(storage.getItem(archiveKey)).originals, ['', 'new corrupt original']);
  assert.equal(createStore(catalog, { storage }).getRecoveries().length, 3);
});

test('archive write failures and primary write failures preserve the working session and all originals', () => {
  const archive = JSON.stringify({ format: 'hobbyorbit-recovery-archive', version: 1, originals: ['older archive'] }, null, 2);
  const storage = memoryStorage([[STORAGE_KEY, '{current'], [recoveryKey, 'older original'], [archiveKey, archive]]);
  const store = createStore(catalog, { storage });
  const state = store.getState();
  const before = new Map(storage.map);
  for (const failKey of [archiveKey, STORAGE_KEY]) {
    storage.failKey = failKey;
    assert.equal(store.importBackup(backup(initial()), preserve).ok, false);
    assert.equal(store.getState(), state);
    assert.deepEqual(storage.map, before);
  }
  storage.failKey = null;
  assert.equal(store.importBackup('{invalid backup', preserve).ok, false);
  assert.equal(store.importBackup(backup(initial()), { preserveConflictingRecovery: 'yes' }).ok, false);
  assert.deepEqual(storage.map, before);
});

test('failed archive rollback safely retains a new copy and exposes it for download', () => {
  const storage = memoryStorage([[STORAGE_KEY, '{current'], [recoveryKey, 'older original']]);
  const store = createStore(catalog, { storage });
  const state = store.getState();
  storage.failKey = STORAGE_KEY;
  storage.failRemove = true;
  assert.match(store.importBackup(backup(initial()), preserve).error, /Recovery rollback could not finish/);
  assert.equal(store.getState(), state);
  assert.equal(storage.getItem(STORAGE_KEY), '{current');
  assert.equal(storage.getItem(recoveryKey), 'older original');
  assert.deepEqual(JSON.parse(storage.getItem(archiveKey)).originals, ['{current']);
  assert.deepEqual(store.getRecoveries().map(file => file.raw), ['{current', 'older original']);
});

test('unrecognized recovery archives remain untouched and downloadable', () => {
  for (const archive of ['{corrupt archive', '{"format":"future","version":2,"originals":[]}']) {
    const storage = memoryStorage([[STORAGE_KEY, '{current'], [recoveryKey, 'older original'], [archiveKey, archive]]);
    const store = createStore(catalog, { storage });
    const before = new Map(storage.map);
    assert.equal(store.getRecoveries().find(file => file.id === 'archive-file').raw, archive);
    assert.equal(store.importBackup(backup(initial()), preserve).ok, false);
    assert.deepEqual(storage.map, before);
    assert.equal(store.getStatus().mode, 'protected');
  }
});

test('there is no application retention cap or large-journal freeze stack limit', () => {
  const state = copy(act(initial(), checkin(undefined, { note: 'This note survives.' })));
  const entry = state.journal[0];
  state.journal = Array.from({ length: 12000 }, (_, i) => ({ ...copy(entry), id: `entry.${i}` }));
  const store = createStore(catalog, { storage: memoryStorage() });
  assert.equal(store.importBackup(backup(state)).ok, true);
  assert.equal(store.getState().journal.length, 12000);
  assert.equal(JSON.parse(store.exportBackup()).state.journal.at(-1).note, 'This note survives.');
});
