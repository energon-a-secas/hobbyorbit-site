import { createIcon } from './icons.js';
import { MOODS } from './model.js';

export const byId = (id) => document.getElementById(id);
export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}
export function button(label, action, className = 'btn btn--quiet', id) {
  const node = el('button', className, label);
  node.type = 'button';
  if (action) node.dataset.action = action;
  if (id !== undefined) node.dataset.id = id;
  return node;
}
export function option(label, value) {
  const node = el('option', '', label);
  node.value = value;
  return node;
}
export function iconBadge(hobby, size = 22) {
  const node = el('span', 'hobby-icon');
  node.style.setProperty('--hobby-color', hobby?.color || '#fca5a5');
  node.append(createIcon(hobby?.icon || 'hobby', size));
  return node;
}
export function field(label, control, hint = '') {
  const wrap = el('div', 'field');
  const title = el('label', '', label);
  title.htmlFor = control.id;
  wrap.append(title, control);
  if (hint) wrap.append(el('p', 'field-hint', hint));
  return wrap;
}
export function dateLabel(value, includeTime = true) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(new Date(value));
}
export const moodLabel = (id) => MOODS.find((mood) => mood.id === id)?.label || id;
export function announce(message, isError = false) {
  const node = byId('app-status');
  node.textContent = message;
  node.classList.toggle('is-error', isError);
}
export function showError(id, message = '') {
  const node = byId(id);
  node.textContent = message;
  node.hidden = !message;
}
export function emptyState(title, description, action) {
  const node = el('div', 'empty-state');
  node.append(el('h3', '', title), el('p', 'muted', description));
  if (action) node.append(action);
  return node;
}
