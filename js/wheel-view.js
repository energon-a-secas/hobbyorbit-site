import { createIcon } from './icons.js';
import { CENTER, RADII, polar, ringPath, sectorAngles, labelLines } from './wheel-geometry.js';

const NS = 'http://www.w3.org/2000/svg';
const colorOf = (node) => /^#[\da-f]{6}$/i.test(node.color) ? node.color : '#fca5a5';

export function html(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function svg(tag, attributes = {}, text) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

function actionButton(action, id, className, label) {
  const button = html('button', className, label);
  button.type = 'button';
  button.dataset.wheelAction = action;
  if (id) button.dataset.wheelId = id;
  return button;
}

function piece(node, start, end, inner, outer, band, marks) {
  const group = svg('g', { class: `wheel-piece ${band ? 'wheel-band' : 'wheel-sector'}` });
  group.dataset.wheelAction = 'select';
  group.dataset.wheelId = node.id;
  group.style.setProperty('--wheel-color', colorOf(node));
  group.append(svg('title', {}, node.label));
  group.append(svg('path', { class: 'wheel-shape', d: ringPath(inner, outer, start, end) }));
  const [cx, cy] = polar(band ? outer - 5 : inner + 13, (start + end) / 2);
  group.append(svg('circle', { class: 'wheel-current-dot', cx, cy, r: band ? 2.7 : 4 }));
  marks.push({ element: group, id: node.id });
  return group;
}

function wheelLabel(node, angle, count, index, labels) {
  if (count > 24 && index % Math.ceil(count / 12) !== 0) return null;
  const [x, y] = polar(count > 8 ? 177 : 172, angle);
  const group = svg('g', { class: `wheel-label${count > 8 ? ' wheel-label-compact' : ''}`, transform: `translate(${x} ${y})` });
  labels.push({ element: group, x, y });
  if (count > 24) {
    group.append(svg('text', { x: 0, y: 5 }, String(index + 1).padStart(2, '0')));
    return group;
  }
  const icon = createIcon(node.icon, count > 8 ? 27 : 25);
  icon.setAttribute('x', count > 8 ? -13.5 : -12.5);
  icon.setAttribute('y', count > 8 ? -13.5 : -29);
  group.append(icon);
  if (count <= 8) {
    const lines = labelLines(node.label, count > 6 ? 10 : 12);
    for (const [lineIndex, line] of lines.entries()) group.append(svg('text', { x: 0, y: 8 + lineIndex * 20, 'data-wheel-max-width': count > 6 ? 100 : 120 }, line));
  }
  return group;
}

function diagram(state, candidates, prefix, labels, marks) {
  const drawing = svg('svg', { class: 'wheel-svg', viewBox: '0 0 600 600', role: 'img', 'aria-labelledby': `${prefix}-title ${prefix}-description` });
  const focus = state.focusId ? state.nodes[state.focusId] : null;
  drawing.append(svg('title', { id: `${prefix}-title` }, `${focus?.label ?? 'Your hobby wheel'}: ${candidates.length} choices`));
  drawing.append(svg('desc', { id: `${prefix}-description` }, 'Large segments have equal odds. The outer band shows their subcategories. Use the Choose or explore list below for full labels and keyboard controls. A dot marks the current hobby; an outline marks the selection.'));
  const ticks = svg('g', { class: 'wheel-ticks' });
  for (let tick = 0; tick < 60; tick++) {
    const [x1, y1] = polar(tick % 5 ? 275 : 273, tick * 6);
    const [x2, y2] = polar(278, tick * 6);
    ticks.append(svg('path', { d: `M ${x1} ${y1} L ${x2} ${y2}` }));
  }
  drawing.append(ticks);
  const rotator = svg('g', { class: 'wheel-rotator' });
  candidates.forEach((node, index) => {
    const { start, end, middle } = sectorAngles(index, candidates.length);
    rotator.append(piece(node, start, end, RADII.inner, RADII.outer, false, marks));
    const children = node.children.map((id) => state.nodes[id]).filter(Boolean);
    children.forEach((child, childIndex) => {
      const size = (end - start) / children.length;
      const gap = candidates.length === 1 && children.length === 1 ? 0 : Math.min(1, size * 0.15);
      const childStart = start + childIndex * size + gap / 2;
      const childEnd = start + (childIndex + 1) * size - gap / 2;
      const group = piece(child, childStart, childEnd, RADII.bandInner, RADII.bandOuter, true, marks);
      if (size >= 13) {
        const [x, y] = polar((RADII.bandInner + RADII.bandOuter) / 2, (childStart + childEnd) / 2);
        const label = svg('g', { class: 'wheel-band-icon', transform: `translate(${x} ${y})` });
        const icon = createIcon(child.icon, 13);
        icon.setAttribute('x', -6.5); icon.setAttribute('y', -6.5);
        label.append(icon); group.append(label); labels.push({ element: label, x, y });
      }
      rotator.append(group);
    });
    const label = wheelLabel(node, middle, candidates.length, index, labels);
    if (label) rotator.append(label);
  });
  drawing.append(rotator);
  drawing.append(svg('circle', { class: 'wheel-hub', cx: CENTER, cy: CENTER, r: 103 }));
  const motif = createIcon(focus?.icon ?? 'hobby', 43);
  motif.setAttribute('x', 278.5); motif.setAttribute('y', 251);
  motif.setAttribute('class', 'wheel-hub-icon'); drawing.append(motif);
  const title = labelLines(focus?.label ?? 'Your orbit', 18);
  title.forEach((line, index) => drawing.append(svg('text', { class: 'wheel-hub-title', x: CENTER, y: 318 + index * 22, 'data-wheel-max-width': 175 }, line)));
  drawing.append(svg('text', { class: 'wheel-hub-note', x: CENTER, y: title.length > 1 ? 363 : 345 }, candidates.length ? `${candidates.length} ${candidates.length === 1 ? 'possibility' : 'possibilities'}` : 'Add your first hobby'));
  if (candidates.length) {
    const pointer = svg('g', { class: 'wheel-pointer' });
    pointer.append(svg('path', { d: 'M 300 20 L 300 48' }));
    pointer.append(svg('path', { class: 'wheel-pointer-tip', d: 'M 291 48 L 309 48 L 300 70 Z' }));
    drawing.append(pointer);
  }
  return { drawing, rotator };
}

function choice(node, index, state, marks, nested = false) {
  const row = html('div', 'wheel-choice-row');
  const choose = actionButton('select', node.id, 'wheel-option');
  choose.setAttribute('aria-label', `Select ${node.label}`);
  if (!nested) choose.append(html('span', 'wheel-order', String(index + 1).padStart(2, '0')));
  const icon = html('span', 'wheel-option-icon');
  icon.style.setProperty('--wheel-color', colorOf(node));
  icon.append(createIcon(node.icon));
  const copy = html('span', 'wheel-option-copy');
  copy.append(html('span', 'wheel-option-name', node.label));
  const badges = html('span', 'wheel-badges');
  const current = html('span', 'wheel-current-badge', 'Current');
  const selected = html('span', 'wheel-selected-badge', 'Selected');
  current.hidden = true; selected.hidden = true;
  badges.append(current, selected); copy.append(badges); choose.append(icon, copy);
  marks.push({ element: choose, id: node.id, current, selected });
  row.append(choose);
  if (node.children.some((id) => state.nodes[id])) {
    const explore = actionButton('focus', node.id, 'wheel-explore', 'Explore');
    explore.setAttribute('aria-label', `Explore ${node.label}`);
    const arrow = svg('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true });
    arrow.append(svg('path', { d: 'm6 3 5 5-5 5' })); explore.append(arrow);
    row.append(explore);
  }
  return row;
}

function choiceList(state, candidates, disclosures, marks) {
  const details = html('details', 'wheel-choices');
  details.dataset.wheelDisclosure = 'choices';
  details.open = disclosures.has('choices');
  const summary = html('summary', 'wheel-choices-summary');
  summary.append(html('span', '', 'Choose or explore'), html('span', 'wheel-choice-count', `${candidates.length} ${candidates.length === 1 ? 'choice' : 'choices'}`));
  details.append(summary);
  const list = html('ol', 'wheel-choice-list');
  candidates.forEach((node, index) => {
    const item = html('li', 'wheel-choice');
    item.append(choice(node, index, state, marks));
    const children = node.children.map((id) => state.nodes[id]).filter(Boolean);
    if (children.length) {
      const nested = html('details', 'wheel-subchoices');
      nested.dataset.wheelDisclosure = node.id;
      nested.open = disclosures.has(node.id);
      nested.append(html('summary', '', `${children.length} in the outer band`));
      const childList = html('ul', 'wheel-child-list');
      children.forEach((child, childIndex) => {
        const childItem = html('li', 'wheel-child');
        childItem.append(choice(child, childIndex, state, marks, true)); childList.append(childItem);
      });
      nested.append(childList); item.append(nested);
    }
    list.append(item);
  });
  details.append(list);
  return details;
}

export function createView(state, candidates, prefix, disclosures) {
  const content = document.createDocumentFragment();
  const labels = [], marks = [];
  const viewport = html('div', 'wheel-viewport');
  viewport.setAttribute('role', 'region'); viewport.setAttribute('aria-label', 'Hobby wheel diagram');
  const stage = html('div', 'wheel-diagram');
  const { drawing, rotator } = diagram(state, candidates, prefix, labels, marks);
  stage.append(drawing); viewport.append(stage); content.append(viewport);
  const toolbar = html('div', 'wheel-toolbar');
  toolbar.append(html('p', 'wheel-caption', candidates.length ? 'Every large segment has an equal chance.' : 'Add hobbies to start your wheel.'));
  const zoom = html('div', 'wheel-zoom');
  zoom.setAttribute('role', 'group'); zoom.setAttribute('aria-label', 'Wheel zoom');
  const zoomOut = actionButton('zoom-out', null, 'wheel-control', '−');
  zoomOut.setAttribute('aria-label', 'Zoom out on wheel');
  const zoomReset = actionButton('zoom-reset', null, 'wheel-control wheel-zoom-reset', '100%');
  zoomReset.setAttribute('aria-label', 'Reset wheel zoom to 100%');
  const zoomIn = actionButton('zoom-in', null, 'wheel-control', '+');
  zoomIn.setAttribute('aria-label', 'Zoom in on wheel');
  zoom.append(zoomOut, zoomReset, zoomIn); toolbar.append(zoom); content.append(toolbar);
  if (candidates.length) content.append(choiceList(state, candidates, disclosures, marks));
  return { content, viewport, stage, drawing, rotator, labels, marks, zoomOut, zoomReset, zoomIn };
}
