import { MEASURES, DEMANDS, ZONES, capacity, zoneFor, strain, formatLevel, summarizeReserves } from './reserves.js';
import { localDateOf } from './model-validation.js';
import { dialogShell } from './dialogs.js';
import { byId, el, button, option, field, dateLabel, announce } from './ui-dom.js';

const NS = 'http://www.w3.org/2000/svg';
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const ICONS = {
  critical: ['M12 7v6', 'M12 17h.01', 'circle'],
  warning: ['M12 3 2 20h20L12 3Z', 'M12 10v4', 'M12 17h.01'],
  ok: ['m8 12.5 2.5 2.5L16 9', 'circle'],
};

function svg(tag, attributes) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function statusIcon(status) {
  const icon = svg('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' });
  for (const part of ICONS[status ?? 'ok']) {
    icon.append(part === 'circle' ? svg('circle', { cx: 12, cy: 12, r: 9 }) : svg('path', { d: part }));
  }
  return icon;
}

/** Zone label and advice; colour is never the only signal (icon + words). */
function zoneLine(zone, prefix = '') {
  const line = el('p', 'reserves-zone');
  line.dataset.status = zone.status ?? 'ok';
  line.append(statusIcon(zone.status), el('span', '', ''));
  line.lastChild.append(el('strong', '', `${prefix}${zone.label}.`), document.createTextNode(` ${zone.advice}`));
  return line;
}

function strainLine(reading) {
  const result = strain(reading);
  if (!result) return null;
  const line = el('p', 'reserves-strain');
  line.dataset.strain = result.id;
  line.append(document.createTextNode(`What is ahead, ${DEMANDS[reading.demand - 1].toLowerCase()} (${reading.demand} of 5): `),
    el('strong', '', `${result.label}.`), document.createTextNode(` ${result.advice}`));
  return line;
}

function meter(measure, value) {
  const row = el('div', 'reserve-meter');
  const name = el('span', 'reserve-name', measure.label);
  name.id = `reserve-meter-${measure.id}`;
  const track = el('div', 'reserve-track');
  track.setAttribute('role', 'meter');
  track.setAttribute('aria-labelledby', name.id);
  track.setAttribute('aria-valuemin', '1');
  track.setAttribute('aria-valuemax', '5');
  track.setAttribute('aria-valuenow', String(value));
  track.setAttribute('aria-valuetext', `${formatLevel(value)} of 5`);
  // Energy and willpower carry severity; flow describes, so it keeps the accent.
  if (measure.id !== 'flow') track.dataset.status = zoneFor(value).status ?? 'ok';
  const fill = el('span', 'reserve-fill');
  fill.style.width = `${value / 5 * 100}%`;
  track.append(fill);
  const number = el('span', 'reserve-value', formatLevel(value));
  number.setAttribute('aria-hidden', 'true');
  row.append(name, track, number);
  return row;
}

export function renderReserves(state) {
  const region = byId('reserves-widget');
  region.hidden = state.settings.reserves === 'hide';
  if (region.hidden) return;
  const latest = state.reserves.at(-1);
  const head = el('div', 'reserves-head');
  const title = el('h3', '', 'Your reserves');
  title.id = 'reserves-title';
  head.append(title, button('How this works', 'reserves-about', 'btn btn--quiet'));
  region.replaceChildren(head);
  region.classList.remove('is-stale');
  if (!latest) {
    region.append(el('p', 'muted', 'How full are you today? A quick check of energy, willpower, and flow, whenever you want. It stays on this device.'),
      button('Quick check', 'reserves-check', 'btn btn--secondary'));
    return;
  }
  const today = latest.localDate === localDateOf(new Date());
  region.classList.toggle('is-stale', !today);
  region.append(el('p', 'reserves-when muted', today ? `Today, ${timeFormat.format(new Date(latest.at))}`
    : `Last reading ${dateLabel(latest.at, false)}. How about now?`));
  const meters = el('div', 'reserve-meters');
  MEASURES.forEach((measure) => meters.append(meter(measure, latest[measure.id])));
  region.append(meters, zoneLine(zoneFor(capacity(latest)), today ? '' : 'Last time: '));
  const ahead = today && strainLine(latest);
  if (ahead) region.append(ahead);
  region.append(button(today ? 'Check again' : 'Quick check', 'reserves-check', 'btn btn--secondary'));
}

/** True when today's latest reading says to rest, for gentle hints elsewhere. */
export function runningOnEmpty(state) {
  const latest = state.reserves.at(-1);
  return Boolean(latest) && latest.localDate === localDateOf(new Date()) && zoneFor(capacity(latest)).id === 'empty';
}

export function openReserveCheck(ctx) {
  const last = ctx.store.getState().reserves.at(-1);
  const modal = dialogShell('Quick check');
  const form = el('form', 'form-stack reserve-form');
  const intro = el('p', 'muted', 'Rate how you are right now, from 1 (empty) to 5 (full). Half steps are fine. Nothing here is required to check in.');
  const about = button('How this works', null, 'btn btn--quiet');
  about.addEventListener('click', openReservesAbout);
  form.append(intro);
  const inputs = {};
  for (const measure of MEASURES) {
    const input = el('input');
    Object.assign(input, { type: 'range', min: '1', max: '5', step: '0.5', id: `reserve-input-${measure.id}` });
    input.value = String(last?.[measure.id] ?? 3);
    const output = el('output', 'reserve-output');
    output.setAttribute('for', input.id);
    output.setAttribute('aria-hidden', 'true');
    const question = el('p', 'field-hint', measure.question);
    question.id = `${input.id}-question`;
    input.setAttribute('aria-describedby', question.id);
    const sync = () => {
      const value = Number(input.value);
      output.textContent = formatLevel(value);
      input.setAttribute('aria-valuetext', `${formatLevel(value)} of 5`);
    };
    input.addEventListener('input', sync); sync();
    const label = el('label', '', measure.label);
    label.htmlFor = input.id;
    const top = el('div', 'reserve-field-top');
    top.append(label, output);
    const ends = el('div', 'reserve-ends');
    ends.setAttribute('aria-hidden', 'true');
    ends.append(el('span', '', `1 · ${measure.low}`), el('span', '', `${measure.high} · 5`));
    const wrap = el('div', 'field reserve-field');
    wrap.append(top, question, input, ends);
    form.append(wrap);
    inputs[measure.id] = input;
  }
  const demand = el('select');
  demand.id = 'reserve-input-demand';
  demand.append(option('Skip this', ''), ...DEMANDS.map((label, index) => option(`${index + 1} · ${label}`, String(index + 1))));
  if (last?.demand) demand.value = String(last.demand);
  form.append(field('How demanding is what is ahead? Optional', demand, 'Compared with your reading, to say whether it is within reach.'));
  const preview = el('div', 'reserve-preview');
  preview.setAttribute('role', 'status');
  const readValues = () => ({ energy: Number(inputs.energy.value), willpower: Number(inputs.willpower.value),
    flow: Number(inputs.flow.value), demand: demand.value ? Number(demand.value) : null });
  const update = () => {
    const values = readValues();
    preview.replaceChildren(zoneLine(zoneFor(capacity(values)), 'Reading: '));
    const ahead = strainLine(values);
    if (ahead) preview.append(ahead);
  };
  form.addEventListener('change', update); update();
  const save = button('Save reading', null, 'btn btn--primary');
  save.type = 'submit';
  form.append(preview, save);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = readValues();
    const result = ctx.dispatch({ type: 'reserve', ...values });
    if (!result.ok) { modal.fail(result.error); return; }
    const zone = zoneFor(capacity(values));
    announce(`Reading saved: ${zone.label}. ${zone.advice}`);
    modal.close();
  });
  modal.body.append(form);
  modal.footer.append(about);
  modal.show();
  inputs.energy.focus();
}

export function openReservesAbout() {
  const modal = dialogShell('How your reserves work');
  const body = modal.body;
  body.append(el('p', '', 'Three quick ratings, each from 1 to 5:'));
  const terms = el('dl', 'reserve-terms');
  terms.append(
    el('dt', '', 'Energy'), el('dd', '', 'How rested and fuelled you feel.'),
    el('dt', '', 'Willpower'), el('dd', '', 'How much effort you can give to things that do not carry you: starting, staying with something hard, saying no.'),
    el('dt', '', 'Flow'), el('dd', '', 'Whether what you are doing is carrying you, or you are pushing.'),
  );
  body.append(terms,
    el('p', '', 'Your reading is the lower of energy and willpower. When either one drops, everything gets harder, and anything that asks more of you than you have costs extra: it feels painful rather than just tiring.'));
  const scale = el('ul', 'reserve-scale');
  for (const zone of [...ZONES].reverse()) {
    const item = el('li');
    const low = ZONES[ZONES.indexOf(zone) - 1];
    const range = zone.id === 'full' ? '5' : `${formatLevel(low ? low.upTo + 0.5 : 1)}–${formatLevel(zone.upTo)}`;
    item.append(el('span', 'reserve-scale-range', range), zoneLine(zone));
    scale.append(item);
  }
  body.append(scale,
    el('p', '', 'If you add how demanding something ahead is, it is compared with your reading: within reach, a stretch (up to 1 point over), or likely to feel painful (more than 1 point over).'),
    el('p', '', 'Flow does not change the reading. It shows whether what you do is carrying you.'),
    el('h3', '', 'Why not adjust for age or lifestyle?'),
    el('p', '', 'The same 3 means different things for different people, and your own sense of today is the best measure there is. Compare readings with your own past in Patterns instead.'),
    el('p', 'field-hint', 'This is a personal rule of thumb, not a medical or scientific measure. If you often read 1 or 2, it may help to talk to someone you trust or a health professional. Readings stay on this device and are part of your backups. Sharing an update never includes them.'));
  modal.show();
}

function sparkline(values, measure, recent) {
  const width = 132, height = 36, pad = 5;
  const x = (index) => (values.length === 1 ? width / 2 : pad + index * (width - pad * 2) / (values.length - 1));
  const y = (value) => pad + (5 - value) / 4 * (height - pad * 2);
  const chart = svg('svg', { class: 'reserve-spark', viewBox: `0 0 ${width} ${height}`, width, height, 'aria-hidden': 'true', focusable: 'false' });
  if (values.length > 1) chart.append(svg('polyline', { points: values.map((value, index) => `${x(index)},${y(value)}`).join(' ') }));
  values.forEach((value, index) => {
    // Hit areas larger than the mark; the readings list is the accessible table view.
    const hit = svg('circle', { class: 'reserve-spark-hit', cx: x(index), cy: y(value), r: 9 });
    const tip = svg('title', {});
    tip.textContent = `${measure.label} ${formatLevel(value)}, ${dateLabel(recent[index].at)}`;
    hit.append(tip);
    chart.append(hit);
  });
  const last = values.length - 1;
  chart.append(svg('circle', { class: 'reserve-spark-latest', cx: x(last), cy: y(values[last]), r: 4 }));
  return chart;
}

export function reservesSection(state) {
  const section = el('section', 'reserves-section');
  section.append(el('h3', '', 'Your reserves'), el('p', 'muted', 'Readings from Quick check, kept apart from your check-ins.'));
  const data = summarizeReserves(state.reserves);
  if (!data.count) {
    section.append(el('p', 'muted reserves-empty', state.settings.reserves === 'hide'
      ? 'No readings yet. Show the reserves widget in Settings to take one.'
      : 'No readings yet. Use Quick check beside your check-in whenever you want.'));
    return section;
  }
  const tiles = el('div', 'reserve-tiles');
  for (const measure of MEASURES) {
    const tile = el('div', 'reserve-tile');
    const values = data.recent.map((reading) => reading[measure.id]);
    tile.append(el('p', 'reserve-tile-label', measure.label), el('p', 'reserve-tile-value', formatLevel(data.latest[measure.id])),
      el('p', 'reserve-tile-note', `Latest · average ${formatLevel(data.averages[measure.id])} over ${data.count} ${data.count === 1 ? 'reading' : 'readings'}`),
      sparkline(values, measure, data.recent));
    tiles.append(tile);
  }
  const zones = el('div', 'reserve-zone-counts');
  zones.append(el('h4', '', 'How often each reading came up'));
  const zoneList = el('ul', 'observation-list');
  data.zones.forEach((zone) => { const row = el('li'); row.append(el('span', '', zone.label), el('strong', '', String(zone.count))); zoneList.append(row); });
  zones.append(zoneList);
  const readings = el('ol', 'reserve-readings');
  [...state.reserves].reverse().slice(0, 10).forEach((reading) => {
    const item = el('li');
    const time = el('time', 'muted', dateLabel(reading.at));
    time.dateTime = reading.at;
    const values = el('p', '', MEASURES.map((measure) => `${measure.label} ${formatLevel(reading[measure.id])}`).join(' · '));
    const zone = zoneFor(capacity(reading));
    const tag = el('span', 'tag reserve-tag');
    tag.dataset.status = zone.status ?? 'ok';
    tag.append(statusIcon(zone.status), document.createTextNode(zone.label));
    const text = el('div', 'reserve-reading-body');
    text.append(time, values, tag);
    if (reading.demand) text.append(el('span', 'muted reserve-demand', `Ahead: ${DEMANDS[reading.demand - 1]}`));
    const remove = button('Delete', 'delete-reserve', 'btn btn--quiet', reading.id);
    remove.setAttribute('aria-label', `Delete reading from ${dateLabel(reading.at)}`);
    item.append(text, remove);
    readings.append(item);
  });
  section.append(tiles, zones, el('h4', 'reserve-readings-title', 'Recent readings'), readings);
  if (data.count > 10) section.append(el('p', 'muted', `Showing the latest 10 of ${data.count} readings. Backups keep them all.`));
  section.append(el('p', 'patterns-footnote muted', 'Readings describe how you felt, not why. Your reading is the lower of energy and willpower.'));
  return section;
}
