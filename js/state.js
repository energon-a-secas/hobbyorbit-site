import { safeSet, safeRemove, storageAvailable } from './neorgon-persist.js';
import { createInitialState, validateState, applyAction } from './model.js';
import { exactFields, requireValue, instant, freezeData } from './model-validation.js';

export const STORAGE_KEY = 'hobbyorbit:state:v1';
const RECOVERY_KEY = 'hobbyorbit:recovery';
const RECOVERY_ARCHIVE_KEY = 'hobbyorbit:recovery:archive:v1';
const savedMessage = 'Saved on this device. Export a backup to keep a separate copy.';
const memoryMessage = 'Changes are only in this session because device storage is unavailable. Export a backup before closing.';

function browserStorage() {
  return {
    // The kit's safeGet fallback cannot distinguish missing data from a blocked read.
    getItem: key => globalThis.localStorage.getItem(key),
    setItem(key, value) {
      if (!safeSet(key, value)) throw new Error('Device storage refused the write.');
    },
    removeItem(key) {
      if (!safeRemove(key)) throw new Error('Device storage refused the removal.');
    },
  };
}

function errorText(error) {
  return error instanceof Error ? error.message : 'Device storage could not be accessed.';
}

function decodeState(raw) {
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error('Saved data is not valid JSON.'); }
  const checked = validateState(value);
  requireValue(checked.ok, checked.error);
  return checked.state;
}

function decodeBackup(text) {
  requireValue(typeof text === 'string', 'Choose a JSON backup file.');
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error('This file is not valid JSON. Choose a Hobby Orbit backup.'); }
  exactFields(value, ['format', 'version', 'exportedAt', 'state'], 'Backup');
  requireValue(value.format === 'hobbyorbit-backup', 'This file is not a Hobby Orbit backup.');
  requireValue(value.version === 1, 'This backup version is not supported. Keep the original file.');
  instant(value.exportedAt, 'Backup export time');
  const checked = validateState(value.state);
  requireValue(checked.ok, checked.error);
  return checked.state;
}

function decodeRecoveryArchive(raw) {
  if (raw === null) return [];
  let archive;
  try { archive = JSON.parse(raw); }
  catch { throw new Error('The recovery archive is not valid JSON. Download it; it remains untouched.'); }
  exactFields(archive, ['format', 'version', 'originals'], 'Recovery archive');
  requireValue(archive.format === 'hobbyorbit-recovery-archive' && archive.version === 1,
    'The recovery archive format is unsupported. Download it; it remains untouched.');
  requireValue(Array.isArray(archive.originals) && archive.originals.every(raw => typeof raw === 'string'),
    'The recovery archive contains invalid originals. Download it; it remains untouched.');
  return archive.originals;
}

export function createStore(catalog, options = {}) {
  const storage = options.storage ?? browserStorage();
  let state = createInitialState(catalog);
  let status = { mode: 'saved', message: savedMessage };
  let recovery = null;
  let protectedOriginal = null;
  let savedRecovery = null;
  let archivedRecovery = null;
  let expectedRaw;
  const listeners = new Set();

  try {
    expectedRaw = storage.getItem(STORAGE_KEY);
    requireValue(expectedRaw === null || typeof expectedRaw === 'string', 'Device storage returned invalid data.');
    if (expectedRaw !== null) {
      try { state = decodeState(expectedRaw); }
      catch (error) {
        recovery = expectedRaw;
        protectedOriginal = expectedRaw;
        status = { mode: 'protected', message: `${errorText(error)} The original is protected. ` +
          'This session is separate; download the recovery file before replacing it with an import.' };
      }
    }
    if (status.mode !== 'protected' && !options.storage && !storageAvailable()) {
      status = { mode: 'memory', message: memoryMessage };
    }
  } catch {
    expectedRaw = undefined;
    status = { mode: 'memory', message: memoryMessage };
  }
  try { savedRecovery = storage.getItem(RECOVERY_KEY); }
  catch { /* Keep any original already read when recovery access is blocked. */ }
  try { archivedRecovery = storage.getItem(RECOVERY_ARCHIVE_KEY); }
  catch { /* Archives are optional; never prevent access to the working state. */ }
  if (recovery === null) recovery = savedRecovery;
  state = freezeData(state);
  status = Object.freeze(status);

  function publish() {
    for (const fn of listeners) {
      try { fn(state, status); }
      catch (error) { console.error('Hobby Orbit could not update a subscriber.', error); }
    }
  }

  function setStatus(mode, message) {
    status = Object.freeze({ mode, message });
  }

  function saveWorkingState(next) {
    if (status.mode === 'protected') return false;
    try {
      const currentRaw = storage.getItem(STORAGE_KEY);
      requireValue(currentRaw === (expectedRaw ?? null),
        'Another tab changed the saved wheel or journal. This session is kept in memory. ' +
        'Export it, then reload to see the other tab’s changes.');
      const text = JSON.stringify(next);
      storage.setItem(STORAGE_KEY, text);
      expectedRaw = text;
      setStatus('saved', savedMessage);
      return true;
    } catch (error) {
      const message = errorText(error);
      setStatus('memory', message.startsWith('Another tab') ? message : memoryMessage);
      return false;
    }
  }

  function dispatch(action) {
    let next;
    try { next = applyAction(state, action, catalog); }
    catch (error) { return { ok: false, saved: false, error: errorText(error) }; }
    const saved = saveWorkingState(next);
    state = freezeData(next);
    publish();
    return { ok: true, saved };
  }

  function getRecoveries() {
    try { savedRecovery = storage.getItem(RECOVERY_KEY); } catch { /* Use the last readable copy. */ }
    try { archivedRecovery = storage.getItem(RECOVERY_ARCHIVE_KEY); } catch { /* Use the last readable copy. */ }
    const records = [];
    const seen = new Set();
    const add = (id, label, raw) => {
      if (typeof raw !== 'string' || seen.has(raw)) return;
      seen.add(raw);
      records.push({ id, label, raw });
    };
    add('primary', 'Original device data', protectedOriginal);
    add('saved', 'Previously saved original', savedRecovery);
    try {
      decodeRecoveryArchive(archivedRecovery).forEach((raw, index) => {
        add(`archive-${index + 1}`, `Archived original ${index + 1}`, raw);
      });
    } catch {
      add('archive-file', 'Unrecognized recovery archive', archivedRecovery);
    }
    return freezeData(records);
  }

  function importBackup(text, importOptions = {}) {
    let next;
    try {
      next = decodeBackup(text);
      requireValue(importOptions !== null && typeof importOptions === 'object' && !Array.isArray(importOptions),
        'Import options must be an object.');
      exactFields(importOptions, Object.hasOwn(importOptions, 'preserveConflictingRecovery') ?
        ['preserveConflictingRecovery'] : [], 'Import options');
      requireValue(!Object.hasOwn(importOptions, 'preserveConflictingRecovery') ||
        typeof importOptions.preserveConflictingRecovery === 'boolean', 'Recovery confirmation must be true or false.');
    }
    catch (error) { return { ok: false, saved: false, error: errorText(error) }; }
    let rollback = null;
    try {
      if (status.mode === 'protected') {
        const existing = storage.getItem(RECOVERY_KEY);
        if (existing === null) {
          storage.setItem(RECOVERY_KEY, recovery);
          rollback = { key: RECOVERY_KEY, before: null, written: recovery };
        } else if (existing !== recovery) {
          requireValue(importOptions.preserveConflictingRecovery === true,
            'A different recovery file already exists. Choose “Keep originals and import” to preserve both.');
          const before = storage.getItem(RECOVERY_ARCHIVE_KEY);
          const originals = decodeRecoveryArchive(before);
          if (!originals.includes(recovery)) {
            const written = JSON.stringify({ format: 'hobbyorbit-recovery-archive', version: 1,
              originals: [...originals, recovery] });
            storage.setItem(RECOVERY_ARCHIVE_KEY, written);
            rollback = { key: RECOVERY_ARCHIVE_KEY, before, written };
          }
        }
      }
      const raw = JSON.stringify(next);
      storage.setItem(STORAGE_KEY, raw);
      expectedRaw = raw;
    } catch (error) {
      let rollbackMessage = '';
      if (rollback) {
        try {
          requireValue(storage.getItem(rollback.key) === rollback.written,
            'Recovery data changed in another tab during import.');
          if (rollback.before === null) storage.removeItem(rollback.key);
          else storage.setItem(rollback.key, rollback.before);
        } catch (rollbackError) {
          rollbackMessage = ` Recovery rollback could not finish: ${errorText(rollbackError)} ` +
            'Your original saved journal and working session are unchanged.';
        }
      }
      return { ok: false, saved: false, error: `Import was not applied. ${errorText(error)}${rollbackMessage}` };
    }
    state = freezeData(next);
    setStatus('saved', savedMessage);
    publish();
    return { ok: true, saved: true };
  }

  return {
    getState: () => state,
    getStatus: () => status,
    dispatch,
    subscribe(fn) {
      requireValue(typeof fn === 'function', 'A subscriber must be a function.');
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    exportBackup: () => JSON.stringify({ format: 'hobbyorbit-backup', version: 1,
      exportedAt: new Date().toISOString(), state }, null, 2),
    importBackup,
    getRecovery: () => recovery,
    getRecoveries,
  };
}
