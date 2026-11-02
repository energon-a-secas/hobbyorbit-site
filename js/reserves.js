// Reserves: three self-ratings from 1 to 5 and one plain rule of thumb on top.
// This is a personal check, not a measurement, and it never predicts.

export const MEASURES = Object.freeze([
  { id: 'energy', label: 'Energy', question: 'How rested and fuelled do you feel?',
    low: 'Drained', high: 'Full of energy' },
  { id: 'willpower', label: 'Willpower', question: 'How easily could you start something you have been putting off?',
    low: 'Not at all', high: 'Easily' },
  { id: 'flow', label: 'Flow', question: 'Is what you are doing carrying you, or are you pushing?',
    low: 'All pushing', high: 'Carried along' },
].map(Object.freeze));

export const DEMANDS = Object.freeze(['Very light', 'Light', 'Moderate', 'Demanding', 'Very demanding']);

// Ordered low to high; a reading belongs to the first zone whose upper bound it does not pass.
export const ZONES = Object.freeze([
  { id: 'empty', upTo: 1.5, label: 'Running on empty', status: 'critical',
    advice: 'Rest is the useful move now. Sleep if you can; anything demanding will feel painful.' },
  { id: 'low', upTo: 2.5, label: 'Running low', status: 'warning',
    advice: 'Keep it light and familiar. Small, easy things count.' },
  { id: 'steady', upTo: 3.5, label: 'Steady', status: null,
    advice: 'Fine for what you planned. Avoid adding extra demands.' },
  { id: 'good', upTo: 4.5, label: 'Good', status: null,
    advice: 'There is room for a stretch if you want one.' },
  { id: 'full', upTo: 5, label: 'Full', status: null,
    advice: 'No penalties. A good moment for something demanding.' },
].map(Object.freeze));

/** When either energy or willpower drops, everything gets harder, so the lower one sets the reading. */
export const capacity = (reading) => Math.min(reading.energy, reading.willpower);

export const zoneFor = (value) => ZONES.find((zone) => value <= zone.upTo) ?? ZONES.at(-1);

/** Compares an optional demand (1–5) with the reading. Null when no demand was given. */
export function strain(reading) {
  if (reading.demand === null) return null;
  const over = reading.demand - capacity(reading);
  if (over <= 0) return { id: 'within', label: 'Within reach', advice: 'What is ahead fits your reading.' };
  if (over <= 1) return { id: 'stretch', label: 'A stretch', advice: 'Plan breaks, and stop before it hurts.' };
  return { id: 'painful', label: 'Likely to feel painful', advice: 'Shrink it, postpone it, or rest first.' };
}

export const formatLevel = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

export function summarizeReserves(reserves, recentCount = 12) {
  const count = reserves.length;
  const average = (id) => (count ? Math.round(reserves.reduce((sum, reading) => sum + reading[id], 0) / count * 10) / 10 : null);
  const zones = [...ZONES].reverse().map((zone) => ({ id: zone.id, label: zone.label,
    count: reserves.filter((reading) => zoneFor(capacity(reading)) === zone).length }))
    .filter((zone) => zone.count);
  return { count, latest: reserves.at(-1) ?? null, zones, recent: reserves.slice(-recentCount),
    averages: Object.fromEntries(MEASURES.map((measure) => [measure.id, average(measure.id)])) };
}
