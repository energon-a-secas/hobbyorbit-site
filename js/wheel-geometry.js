// Angles increase clockwise from 12 o'clock, matching the editable sibling order.
export const CENTER = 300;
export const RADII = Object.freeze({ inner: 112, outer: 232, bandInner: 241, bandOuter: 265 });
export const normalizeAngle = (angle) => ((angle % 360) + 360) % 360;

export function polar(radius, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return [CENTER + Math.cos(radians) * radius, CENTER + Math.sin(radians) * radius];
}

const point = (radius, angle) => polar(radius, angle).map((value) => +value.toFixed(4)).join(' ');

export function ringPath(inner, outer, start, end) {
  const sweep = Math.min(360, Math.max(0, end - start));
  if (!sweep || outer <= inner || inner < 0) return '';
  if (sweep === 360) {
    // Two arcs avoid SVG's coincident-endpoint full-circle failure.
    const outside = `M ${point(outer, start)} A ${outer} ${outer} 0 1 1 ${point(outer, start + 180)} A ${outer} ${outer} 0 1 1 ${point(outer, start + 360)}`;
    return `${outside} L ${point(inner, start + 360)} A ${inner} ${inner} 0 1 0 ${point(inner, start + 180)} A ${inner} ${inner} 0 1 0 ${point(inner, start)} Z`;
  }
  const large = sweep > 180 ? 1 : 0;
  return `M ${point(outer, start)} A ${outer} ${outer} 0 ${large} 1 ${point(outer, start + sweep)} L ${point(inner, start + sweep)} A ${inner} ${inner} 0 ${large} 0 ${point(inner, start)} Z`;
}

export function sectorAngles(index, count) {
  const size = 360 / count;
  const gap = count === 1 ? 0 : Math.min(1.3, size * 0.13);
  return { start: index * size + gap / 2, end: (index + 1) * size - gap / 2, middle: (index + 0.5) * size, size };
}

export function spinTarget(index, count, rotation = 0) {
  const landing = normalizeAngle(-((index + 0.5) * 360 / count));
  return rotation + 1080 + normalizeAngle(landing - normalizeAngle(rotation));
}

export function indexAtPointer(rotation, count) {
  return count ? Math.min(count - 1, Math.floor(normalizeAngle(-rotation) / (360 / count))) : -1;
}

export function visibleNodes(state) {
  const ids = state.focusId ? state.nodes[state.focusId]?.children ?? [] : state.rootIds;
  return ids.map((id) => state.nodes[id]).filter(Boolean);
}

export function labelLines(label, limit = 15, maximum = 2) {
  const words = String(label).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > limit) { lines.push(line); line = ''; }
    line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  const clipped = lines.slice(0, maximum).map((value) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value);
  if (lines.length > maximum) clipped[maximum - 1] = `${clipped[maximum - 1].slice(0, limit - 1)}…`;
  return clipped;
}
