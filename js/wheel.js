import { normalizeAngle, spinTarget, visibleNodes } from './wheel-geometry.js';
import { createView, html } from './wheel-view.js';

let instance = 0;

/** The wheel has transient visual state only. All personal state belongs to its caller. */
export function createWheel(element, options = {}) {
  const root = html('div', 'wheel-root');
  const prefix = `hobby-wheel-${++instance}`;
  element.replaceChildren(root);
  let state = { nodes: {}, rootIds: [], focusId: null, selectedId: null, currentId: null, reducedMotion: false };
  let candidates = [], view, signature = '', visualSignature = '', rotation = 0, zoom = 1;
  let pending = null, zoomFrame = null, destroyed = false;
  const disclosures = new Set();
  const measure = document.createElement('canvas').getContext('2d');

  function fitLabels() {
    if (!measure) return;
    for (const text of root.querySelectorAll('[data-wheel-max-width]')) {
      measure.font = getComputedStyle(text).font;
      const maximum = Number(text.dataset.wheelMaxWidth);
      if (measure.measureText(text.textContent).width <= maximum) continue;
      const characters = Array.from(text.textContent.replace(/…$/, ''));
      while (characters.length > 1 && measure.measureText(`${characters.join('')}…`).width > maximum) characters.pop();
      text.textContent = `${characters.join('')}…`;
    }
  }

  function rotate(angle) {
    rotation = angle;
    view.rotator.setAttribute('transform', `rotate(${angle} 300 300)`);
    // Counter-rotate labels, so the stopped wheel remains readable at any angle.
    for (const label of view.labels) label.element.setAttribute('transform', `translate(${label.x} ${label.y}) rotate(${-angle})`);
  }

  function markSelection() {
    for (const mark of view.marks) {
      const selected = mark.id === state.selectedId;
      const current = mark.id === state.currentId;
      mark.element.classList.toggle('wheel-is-selected', selected);
      mark.element.classList.toggle('wheel-is-current', current);
      if (mark.element.tagName === 'BUTTON') {
        mark.element.setAttribute('aria-pressed', String(selected));
        mark.current.hidden = !current; mark.selected.hidden = !selected;
        const node = state.nodes[mark.id];
        mark.element.setAttribute('aria-label', `Select ${node.label}${current ? ', current hobby' : ''}`);
      }
    }
  }

  function showZoom() {
    view.stage.style.width = `${zoom * 100}%`;
    view.zoomReset.textContent = `${Math.round(zoom * 100)}%`;
    view.zoomOut.disabled = zoom <= 1; view.zoomIn.disabled = zoom >= 2;
    if (zoom > 1) {
      view.viewport.tabIndex = 0;
      view.viewport.setAttribute('aria-label', `Hobby wheel diagram at ${Math.round(zoom * 100)}% zoom. Scroll to explore.`);
    } else {
      view.viewport.removeAttribute('tabindex');
      view.viewport.setAttribute('aria-label', 'Hobby wheel diagram');
    }
  }

  function setZoom(value) {
    const previous = zoom;
    zoom = Math.min(2, Math.max(1, value));
    if (previous === zoom) return;
    const viewport = view.viewport;
    const left = (viewport.scrollLeft + viewport.clientWidth / 2) * zoom / previous;
    const top = (viewport.scrollTop + viewport.clientHeight / 2) * zoom / previous;
    showZoom();
    cancelAnimationFrame(zoomFrame);
    zoomFrame = requestAnimationFrame(() => {
      if (destroyed || !root.contains(viewport)) return;
      viewport.scrollLeft = left - viewport.clientWidth / 2;
      viewport.scrollTop = top - viewport.clientHeight / 2;
    });
  }

  function setBusy(busy) {
    root.classList.toggle('wheel-is-spinning', busy);
    view.drawing.setAttribute('aria-busy', String(busy));
  }

  function cancelSpin() {
    if (!pending) return;
    const cancelled = pending;
    pending = null;
    cancelAnimationFrame(cancelled.frame);
    setBusy(false);
    cancelled.resolve(null);
  }

  function update(next) {
    if (destroyed) return;
    cancelSpin();
    if (view) for (const details of root.querySelectorAll('[data-wheel-disclosure]')) {
      if (details.open) disclosures.add(details.dataset.wheelDisclosure);
      else disclosures.delete(details.dataset.wheelDisclosure);
    }
    state = { ...next };
    candidates = visibleNodes(state);
    const nextSignature = JSON.stringify([state.focusId, candidates.map((node) => node.id)]);
    const nextVisual = JSON.stringify([state.nodes[state.focusId] ?? null, candidates.map((node) => [node, node.children.map((id) => state.nodes[id])])]);
    if (view && visualSignature === nextVisual && signature === nextSignature) {
      // Ordinary selection and check-in updates preserve focus, disclosure, and scroll.
      markSelection();
      return;
    }
    const focused = root.contains(document.activeElement) ? document.activeElement : null;
    const focusedAction = focused?.dataset.wheelAction;
    const focusedId = focused?.dataset.wheelId;
    const focusedDisclosure = focused?.tagName === 'SUMMARY' ? focused.parentElement.dataset.wheelDisclosure : null;
    const changed = nextSignature !== signature;
    if (changed) { rotation = 0; zoom = 1; }
    if (changed && candidates.length > 8) disclosures.add('choices');
    signature = nextSignature;
    visualSignature = nextVisual;
    const scroll = view && !changed ? { left: view.viewport.scrollLeft, top: view.viewport.scrollTop } : null;
    view = createView(state, candidates, prefix, disclosures);
    root.replaceChildren(view.content);
    fitLabels(); rotate(rotation); markSelection(); showZoom();
    if (scroll) { view.viewport.scrollLeft = scroll.left; view.viewport.scrollTop = scroll.top; }
    if (focused) {
      const replacement = focusedAction
        ? [...root.querySelectorAll('button[data-wheel-action]')].find((button) => button.dataset.wheelAction === focusedAction && button.dataset.wheelId === focusedId)
        : [...root.querySelectorAll('[data-wheel-disclosure] > summary')].find((summary) => summary.parentElement.dataset.wheelDisclosure === focusedDisclosure);
      replacement?.focus({ preventScroll: true });
    }
  }

  function finishSpin(request) {
    if (pending !== request || destroyed) return;
    pending = null;
    rotate(normalizeAngle(request.target));
    state = { ...state, selectedId: request.id };
    markSelection(); setBusy(false);
    request.resolve(request.id);
    options.onResult?.(request.id);
  }

  function spin() {
    if (destroyed || !candidates.length) return Promise.resolve(null);
    if (pending) return pending.promise;
    // One uniform draw, before animation. The animation never changes the result.
    const index = Math.floor(Math.random() * candidates.length);
    const request = { id: candidates[index].id, from: rotation, target: spinTarget(index, candidates.length, rotation), start: performance.now(), frame: null };
    request.promise = new Promise((resolve) => { request.resolve = resolve; });
    pending = request;
    setBusy(true);
    if (state.reducedMotion) {
      finishSpin(request);
      return request.promise;
    }
    const duration = candidates.length === 1 ? 1100 : 2400;
    const animate = (now) => {
      if (pending !== request || destroyed) return;
      const progress = Math.min(1, (now - request.start) / duration);
      const eased = 1 - (1 - progress) ** 5;
      rotate(request.from + (request.target - request.from) * eased);
      if (progress < 1) request.frame = requestAnimationFrame(animate);
      else finishSpin(request);
    };
    request.frame = requestAnimationFrame(animate);
    return request.promise;
  }

  function onClick(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-wheel-action]') : null;
    if (!target || !root.contains(target)) return;
    const { wheelAction: action, wheelId: id } = target.dataset;
    if (action === 'zoom-out') return setZoom(zoom - 0.25);
    if (action === 'zoom-in') return setZoom(zoom + 0.25);
    if (action === 'zoom-reset') return setZoom(1);
    cancelSpin();
    if (action === 'select') {
      state = { ...state, selectedId: id };
      markSelection(); options.onSelect?.(id);
    }
    if (action === 'focus') options.onFocus?.(id);
  }

  function destroy() {
    if (destroyed) return;
    cancelSpin(); destroyed = true;
    cancelAnimationFrame(zoomFrame);
    root.removeEventListener('click', onClick);
    root.remove();
  }

  root.addEventListener('click', onClick);
  update(state);
  document.fonts?.ready.then(() => { if (!destroyed) fitLabels(); });
  return { update, spin, destroy };
}
