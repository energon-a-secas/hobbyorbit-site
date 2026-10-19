import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateTree, requireValue } from '../js/model-validation.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(project, '../aficion-site/data');
// Advance deliberately when publishing a new reviewed taxonomy snapshot.
const SNAPSHOT_DATE = '2026-10-19';
const categoryStyle = {
  model: ['tools', '#c4b5fd'], rail: ['train', '#93c5fd'], brick: ['brick', '#fcd34d'],
  figure: ['figure', '#f9a8d4'], tabletop: ['dice', '#a5b4fc'], anime: ['screen', '#f9a8d4'],
  film: ['film', '#c4b5fd'], video: ['camera', '#67e8f9'], starwars: ['star', '#fde68a'],
  radio: ['satellite', '#6ee7b7'], maker: ['tools', '#fca5a5'], drone: ['drone', '#7dd3fc'],
  astro: ['star', '#a5b4fc'], music: ['headphones', '#fca5a5'], retro: ['screen', '#c4b5fd'],
  game: ['gamepad', '#93c5fd'], cosplay: ['mask', '#f9a8d4'], coffee: ['coffee', '#fdba74'],
  book: ['book', '#fcd34d'], garden: ['flower', '#86efac'], kitchen: ['chef', '#fdba74'],
  outdoor: ['leaf', '#6ee7b7'], core: ['tools', '#c4b5fd'],
};
const iconOverrides = {
  'core.painting': 'brush', 'core.photography': 'camera', 'core.programming': 'code',
  'core.audio': 'headphones', 'core.writing': 'pen', 'music.guitar': 'guitar',
  'music.pedals': 'guitar', 'maker.arduino': 'code', 'outdoor.birdwatching': 'leaf',
};
const readJSON = async file => JSON.parse(await readFile(file, 'utf8'));
const atlas = await readJSON(path.join(source, 'atlas.json'));
const nodes = Object.create(null);
const roots = [];
let hobbies = 0;
let inner = 0;

function ordered(sourceNodes, order = []) {
  const byId = new Map(sourceNodes.map(node => [node.id, node]));
  requireValue(byId.size === sourceNodes.length, 'The source contains duplicate node IDs.');
  requireValue(new Set(order).size === order.length, 'A source order contains duplicate IDs.');
  requireValue(order.every(id => byId.has(id)), 'A source order refers to an unknown node.');
  const listed = new Set(order);
  return [...order, ...sourceNodes.filter(node => !listed.has(node.id)).map(node => node.id)];
}

function add(sourceNode, icon, color) {
  requireValue(!Object.hasOwn(nodes, sourceNode.id), `Duplicate catalog ID: ${sourceNode.id}.`);
  const node = { id: sourceNode.id, label: sourceNode.label,
    icon: iconOverrides[sourceNode.id] ?? icon, color, children: [], sourceId: sourceNode.id };
  Object.defineProperty(nodes, node.id, { value: node, enumerable: true, writable: true });
  return node;
}

function category(id, label, sourceNodes, order) {
  const [icon, color] = categoryStyle[id];
  const categoryId = `category.${id}`;
  const root = add({ id: categoryId, label }, icon, color);
  root.sourceId = id;
  root.children = ordered(sourceNodes, order);
  roots.push(categoryId);
  for (const sourceNode of sourceNodes) add(sourceNode, icon, color);
  hobbies += sourceNodes.length;
}

for (const id of atlas.clusters) {
  const cluster = await readJSON(path.join(source, 'clusters', `${id}.json`));
  category(id, cluster.label, cluster.nodes, cluster.layout?.order);
}
category('core', 'Core Skills', atlas.core, atlas.coreLayout?.order);

for (const filename of (await readdir(path.join(source, 'inner'))).filter(file => file.endsWith('.json')).sort()) {
  const detail = await readJSON(path.join(source, 'inner', filename));
  requireValue(Object.hasOwn(nodes, detail.of), `Missing parent for ${filename}.`);
  const parent = nodes[detail.of];
  requireValue(parent.children.length === 0, `Duplicate inner tree for ${detail.of}.`);
  parent.children = ordered(detail.nodes, detail.layout?.order);
  for (const sourceNode of detail.nodes) add(sourceNode, parent.icon, parent.color);
  inner += detail.nodes.length;
}

validateTree(nodes, roots);
requireValue(roots.length === 23 && hobbies === 330 && inner === 178 && Object.keys(nodes).length === 531,
  'Source taxonomy counts changed. Review the new snapshot and contracts before regenerating.');
const catalog = { schema: 1, source: 'Aficion', generated: SNAPSHOT_DATE, roots, nodes,
  counts: { categories: roots.length, hobbies, inner } };
await mkdir(path.join(project, 'data'), { recursive: true });
await writeFile(path.join(project, 'data', 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Generated ${Object.keys(nodes).length} nodes: ${roots.length} categories, ${hobbies} hobbies, ${inner} inner nodes.`);
