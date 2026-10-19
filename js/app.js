import { loadCatalog } from './catalog.js';
import { createStore } from './state.js';
import { createInterface, renderBootError } from './render.js';
import { bindEvents } from './events.js';
import { startPwa } from './pwa.js';

async function init() {
  try {
    const catalog = await loadCatalog();
    const store = createStore(catalog);
    const context = createInterface(catalog, store);
    bindEvents(context);
    startPwa(store);
  } catch (error) {
    renderBootError(error, init);
  }
}
init();
