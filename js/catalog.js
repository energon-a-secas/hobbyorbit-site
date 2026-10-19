import { exactFields, requireValue, localDate, validateTree, freezeData } from './model-validation.js';

const pathIndexes = new WeakMap();

function validateCatalog(catalog) {
  exactFields(catalog, ['schema', 'source', 'generated', 'roots', 'nodes', 'counts'], 'Catalog');
  requireValue(catalog.schema === 1 && catalog.source === 'Aficion', 'The catalog format is not supported.');
  localDate(catalog.generated, 'Catalog date');
  exactFields(catalog.counts, ['categories', 'hobbies', 'inner'], 'Catalog counts');
  requireValue(catalog.counts.categories === 23 && catalog.counts.hobbies === 330 && catalog.counts.inner === 178,
    'The catalog counts do not match this version.');
  validateTree(catalog.nodes, catalog.roots);
  requireValue(catalog.roots.length === 23 && Object.keys(catalog.nodes).length === 531,
    'The catalog is incomplete.');
  let hobbies = 0;
  let inner = 0;
  for (const id of catalog.roots) {
    requireValue(id.startsWith('category.'), 'A catalog category has an invalid ID.');
    hobbies += catalog.nodes[id].children.length;
    for (const child of catalog.nodes[id].children) inner += catalog.nodes[child].children.length;
  }
  requireValue(hobbies === 330 && inner === 178, 'The catalog hierarchy is incomplete.');
  return freezeData(catalog);
}

export async function loadCatalog() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('./data/catalog.json', { signal: controller.signal });
    requireValue(response.ok, `Catalog request failed (${response.status}).`);
    return validateCatalog(await response.json());
  } catch (error) {
    throw new Error(`The hobby catalog could not load. Retry when the app is connected. ${
      error instanceof Error ? error.message : 'The catalog data could not be read.'}`);
  } finally {
    clearTimeout(timeout);
  }
}

function pathIndex(catalog) {
  if (!pathIndexes.has(catalog)) {
    const parents = new Map();
    for (const node of Object.values(catalog.nodes)) {
      for (const child of node.children) parents.set(child, node.id);
    }
    pathIndexes.set(catalog, parents);
  }
  return pathIndexes.get(catalog);
}

export function catalogPath(catalog, id) {
  if (typeof id !== 'string' || !Object.hasOwn(catalog.nodes, id)) return [];
  const parents = pathIndex(catalog);
  const path = [];
  let cursor = id;
  while (cursor) {
    path.unshift(catalog.nodes[cursor]);
    cursor = parents.get(cursor);
  }
  return path;
}

function normalized(text) {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

export function searchCatalog(catalog, query = '') {
  requireValue(typeof query === 'string', 'Search must be text.');
  const needle = normalized(query.trim());
  const categories = new Set(catalog.roots);
  const ordered = [];
  const visit = id => {
    ordered.push(catalog.nodes[id]);
    for (const child of catalog.nodes[id].children) visit(child);
  };
  for (const id of catalog.roots) visit(id);
  const matches = ordered.filter(node => catalogPath(catalog, node.id)
    .some(ancestor => normalized(ancestor.label).includes(needle)));
  const hobbies = matches.filter(node => !categories.has(node.id));
  return hobbies.length ? hobbies : matches;
}
