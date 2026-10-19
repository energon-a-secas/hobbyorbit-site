import { createWheel } from './wheel.js';
import { MOODS, TRIGGERS } from './model.js';
import { prefersReducedMotion } from './neorgon-dom.js';
import { byId, el, button, option, iconBadge, announce, showError } from './ui-dom.js';
import { renderCurrent, renderManager, renderJournal, renderPatterns, renderStorage, renderBreadcrumb } from './ui-views.js';

function buildForm(state) {
  const moods = byId('mood-options');
  moods.replaceChildren();
  MOODS.forEach((mood) => {
    const label = el('label', 'mood-choice');
    const radio = el('input'); radio.type = 'radio'; radio.name = 'mood'; radio.value = mood.id;
    radio.checked = mood.id === state.mood; radio.required = true;
    label.append(radio, el('span', '', mood.label)); moods.append(label);
  });
  const trigger = byId('checkin-trigger');
  trigger.replaceChildren(option('No particular trigger', ''));
  TRIGGERS.forEach((value) => trigger.append(option(value, value)));
  trigger.append(option('Something else…', '__custom__'));
  byId('hemisphere').value = state.settings.hemisphere;
  byId('motion').value = state.settings.motion;
}

function updateHobbyOptions(state, keepSelection = true) {
  const select = byId('checkin-hobby');
  const previous = keepSelection ? select.value : state.current?.id || '';
  select.replaceChildren(option('Choose a hobby or rest…', ''), option('Taking a rest', '__rest__'));
  const visit = (id, depth) => {
    const node = state.nodes[id];
    select.append(option(`${'　'.repeat(depth)}${node.label}`, id));
    node.children.forEach((child) => visit(child, depth + 1));
  };
  state.rootIds.forEach((id) => visit(id, 0));
  if (state.current && !state.nodes[state.current.id]) select.append(option(`${state.current.label} (current, removed from wheel)`, state.current.id));
  if ([...select.options].some((item) => item.value === previous)) select.value = previous;
  else select.value = '';
}

export function createInterface(catalog, store) {
  const ui = { view: 'wheel', focusId: null, selectedId: null, spinning: false, spinId: 0 };
  let treeSignature = ''; let wheelSignature = ''; let optionsSignature = '';
  let preferencesSignature = '';
  let renderedJournal = null; let renderedPatterns = null;
  const ctx = { catalog, store, ui, wheel: null };
  const renderActiveHistory = (state) => {
    if (ui.view === 'journal' && renderedJournal !== state.journal) {
      renderJournal(state); renderedJournal = state.journal;
    }
    if (ui.view === 'patterns' && renderedPatterns !== state) {
      renderPatterns(state); renderedPatterns = state;
    }
  };
  ctx.dispatch = (action) => {
    const result = store.dispatch(action);
    if (!result.ok) announce(result.error, true);
    else if (!result.saved) announce('This change is here for this session. Download a backup to keep it.');
    return result;
  };
  ctx.renderSuggestion = () => {
    const state = store.getState(); const node = state.nodes[ui.selectedId];
    const region = byId('suggestion');
    const copy = el('div', 'suggestion-copy');
    copy.append(el('p', 'eyebrow', 'Just a possibility'));
    if (node) {
      copy.append(el('h4', '', node.label));
      const actions = el('div', 'suggestion-actions');
      actions.append(button('Check in with this', 'use-suggestion', 'btn btn--secondary'));
      if (node.children.length) actions.append(button('Explore inside', 'focus', 'btn btn--quiet', node.id));
      region.replaceChildren(iconBadge(node), copy, actions);
      if (state.locked && state.current?.id !== node.id) copy.append(el('p', 'field-hint', 'Your current hobby is locked. Unlock before saving a change.'));
    } else {
      copy.append(el('p', 'muted', 'Spin, choose a slice, or follow your own feeling.'));
      region.replaceChildren(copy);
    }
  };
  ctx.setView = (view, focus = false) => {
    if (!['wheel', 'journal', 'patterns', 'settings'].includes(view)) return;
    ui.view = view;
    document.querySelectorAll('[data-view]').forEach((tab) => {
      const active = tab.dataset.view === view;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      byId(`panel-${tab.dataset.view}`).hidden = !active;
      if (active && focus) tab.focus();
    });
    renderActiveHistory(store.getState());
  };
  ctx.setFocus = (id) => {
    if (ui.spinning) { ui.spinning = false; ui.spinId++; }
    ui.focusId = id || null; ui.selectedId = null; ctx.refresh();
  };
  ctx.resetDraft = () => {
    const state = store.getState();
    updateHobbyOptions(state, false);
    byId('checkin-hobby').value = state.current?.id || (state.journal.length ? '__rest__' : '');
    const mood = byId('checkin-form').elements.namedItem('mood'); mood.value = state.mood;
    byId('checkin-trigger').value = ''; byId('checkin-custom-trigger').value = ''; byId('checkin-note').value = '';
    byId('custom-trigger-field').hidden = true; showError('checkin-error');
    byId('hemisphere').value = state.settings.hemisphere; byId('motion').value = state.settings.motion;
  };
  ctx.refresh = () => {
    const state = store.getState();
    if (ui.focusId && !state.nodes[ui.focusId]) ui.focusId = null;
    if (ui.selectedId && !state.nodes[ui.selectedId]) ui.selectedId = null;
    const tree = JSON.stringify([state.rootIds, state.nodes]);
    const options = tree + JSON.stringify(state.current);
    if (options !== optionsSignature) { updateHobbyOptions(state); optionsSignature = options; }
    const nextWheelSignature = JSON.stringify([tree, ui.focusId, ui.selectedId, state.current?.id, state.settings.motion, prefersReducedMotion()]);
    if (!ui.spinning && nextWheelSignature !== wheelSignature) {
      ctx.wheel.update({ nodes: state.nodes, rootIds: state.rootIds, focusId: ui.focusId, selectedId: ui.selectedId, currentId: state.current?.id || null, reducedMotion: state.settings.motion === 'reduce' || prefersReducedMotion() });
      wheelSignature = nextWheelSignature;
    }
    if (tree !== treeSignature || ctx.lastFocus !== ui.focusId) { renderManager(state, ui); treeSignature = tree; ctx.lastFocus = ui.focusId; }
    renderBreadcrumb(state, ui); renderCurrent(state); ctx.renderSuggestion();
    byId('journal-count').textContent = String(state.journal.length);
    renderActiveHistory(state); renderStorage(store);
    byId('starter-label').hidden = !state.starter;
    const focus = state.nodes[ui.focusId]; const count = focus ? focus.children.length : state.rootIds.length;
    byId('wheel-context').textContent = focus ? `Exploring ${focus.label}` : state.starter ? 'Six starting points. Make them yours.' : `${state.rootIds.length} ${state.rootIds.length === 1 ? 'category' : 'categories'}, arranged your way.`;
    byId('spin-button').disabled = ui.spinning || !count;
    byId('spin-button').textContent = ui.spinning ? 'Finding a possibility…' : focus ? `Spin inside ${focus.label}` : 'Spin the wheel';
    byId('spin-scope').textContent = count ? `Equal chance for each of ${count} ${count === 1 ? 'slice' : 'slices'}. No obligation.` : 'Add a hobby here to give it a spin.';
    const preferences = JSON.stringify(state.settings);
    if (preferences !== preferencesSignature) {
      byId('hemisphere').value = state.settings.hemisphere; byId('motion').value = state.settings.motion;
      preferencesSignature = preferences;
    }
  };
  buildForm(store.getState());
  ctx.wheel = createWheel(byId('wheel-mount'), {
    onSelect(id) { if (ui.spinning) { ui.spinning = false; ui.spinId++; } ui.selectedId = id; ctx.refresh(); },
    onFocus: ctx.setFocus,
    onResult(id) { ui.selectedId = id; ctx.renderSuggestion(); announce(`${store.getState().nodes[id]?.label || 'A possibility'} came up. Your current hobby has not changed.`); },
  });
  ctx.refresh(); ctx.resetDraft();
  store.subscribe(ctx.refresh);
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  motionQuery.addEventListener('change', ctx.refresh);
  byId('boot-state').hidden = true; byId('app-content').hidden = false;
  return ctx;
}

export function renderBootError(error, retry) {
  const region = byId('boot-state');
  const action = button('Try again', null, 'btn btn--primary');
  action.addEventListener('click', retry, { once: true });
  region.replaceChildren(el('h3', '', 'Your wheel could not load.'), el('p', 'muted', `${error.message || 'The hobby catalog is unavailable.'} Check your connection and try again.`), action);
}
