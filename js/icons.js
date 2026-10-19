// A small, coherent line-icon set. All paths are authored here; labels stay data.
const NS = 'http://www.w3.org/2000/svg';
const definitions = {
  hobby: ['Hobby orbit', ['circle', { cx: 12, cy: 12, r: 3 }], ['ellipse', { cx: 12, cy: 12, rx: 10, ry: 4.5, transform: 'rotate(-35 12 12)' }], ['circle', { cx: 19, cy: 6, r: 1.5, fill: 'currentColor', stroke: 'none' }]],
  guitar: ['Guitar', ['path', { d: 'm14 10 5-6 2 2-6 5M18 4l2-2 2 2-2 2M8 10c-3-1-5 1-5 4 0 4 5 7 8 5 2-1 2-3 1-5l3-3-2-2-3 3c0-1-1-2-2-2Z' }], ['circle', { cx: 8.5, cy: 15.5, r: 1.5 }]],
  camera: ['Camera', ['path', { d: 'M4 7h4l1.5-3h5L16 7h4a1 1 0 0 1 1 1v11H3V8a1 1 0 0 1 1-1Z' }], ['circle', { cx: 12, cy: 13, r: 4 }], ['path', { d: 'M17.5 9.5h.01' }]],
  book: ['Book', ['path', { d: 'M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1v15M5 8h3M5 11h3M16 8h3M16 11h3' }]],
  code: ['Code', ['path', { d: 'm7 6-6 6 6 6M17 6l6 6-6 6M14 3l-4 18' }]],
  leaf: ['Leaf', ['path', { d: 'M20 3C8 2 2 7 5 15c1 3 6 5 9 3 5-3 6-8 6-15ZM3 21 16 8M8 16v-5M8 16h5' }]],
  gamepad: ['Game controller', ['path', { d: 'M8 7h8c3 0 4 3 5 7l1 5c0 2-2 2-3 1l-4-4H9l-4 4c-1 1-3 1-3-1l1-5c1-4 2-7 5-7ZM7 10v4M5 12h4M16 11h.01M19 13h.01' }]],
  dice: ['Dice', ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 3 }], ['path', { d: 'M7 7h.01M17 7h.01M12 12h.01M7 17h.01M17 17h.01', 'stroke-width': 3 }]],
  brush: ['Paintbrush', ['path', { d: 'm9 12 9-9c2-2 4 0 2 2l-8 10M8 12l4 4c0 4-4 6-9 5 2-2 0-3 2-6 1-1 2-2 3-3Z' }]],
  coffee: ['Coffee', ['path', { d: 'M3 8h14v7a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6V8ZM17 9h2a3 3 0 0 1 0 6h-2M6 2v2M10 1v3M14 2v2' }]],
  tools: ['Tools', ['path', { d: 'm3 3 4 2v3l6 6M14 15l5 5a2 2 0 0 0 3-3l-5-5M21 3l-4 4-3-3 4-3a6 6 0 0 0-7 8L2 18a2 2 0 0 0 3 3l9-9a6 6 0 0 0 7-9Z' }]],
  star: ['Star', ['path', { d: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z' }]],
  film: ['Film', ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ['path', { d: 'M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4M7 12h10' }]],
  headphones: ['Headphones', ['path', { d: 'M3 14v-3a9 9 0 0 1 18 0v3M3 12h3v9H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 1-2ZM21 12h-3v9h2a2 2 0 0 0 2-2v-5a2 2 0 0 0-1-2Z' }]],
  train: ['Train', ['rect', { x: 5, y: 2, width: 14, height: 16, rx: 3 }], ['path', { d: 'M5 11h14M12 3v8M8 15h.01M16 15h.01M8 18l-3 4M16 18l3 4M7 21h10' }]],
  drone: ['Drone', ['circle', { cx: 5, cy: 5, r: 3 }], ['circle', { cx: 19, cy: 5, r: 3 }], ['circle', { cx: 5, cy: 19, r: 3 }], ['circle', { cx: 19, cy: 19, r: 3 }], ['path', { d: 'm5 5 5 5m4 4 5 5M19 5l-5 5m-4 4-5 5M9 9h6v6H9Z' }]],
  brick: ['Building bricks', ['path', { d: 'm3 8 9-5 9 5v10l-9 5-9-5V8Zm0 0 9 5 9-5M12 13v10M7 6V3l5-2 5 2v3M7 3l5 3 5-3' }]],
  satellite: ['Satellite', ['path', { d: 'm10 7 7 7-3 3-7-7 3-3ZM7 10l-3 3-3-3 3-3 3 3Zm7 7 3-3 3 3-3 3-3-3ZM13 4l7 7M16 7l3-3M19 1a4 4 0 0 1 4 4M8 16l-4 4M4 16v4h4' }]],
  chef: ['Cooking', ['path', { d: 'M7 14a5 5 0 1 1 1-9 5 5 0 0 1 8 0 5 5 0 1 1 1 9v7H7v-7ZM7 17h10M10 11v3M14 11v3' }]],
  flower: ['Flower', ['path', { d: 'M10 9C5 4 10 0 12 5c2-5 7-1 2 4 7-2 8 4 2 4 2 6-3 8-4 2-1 6-6 4-4-2-6 0-5-6 2-4ZM12 16v7M12 21c-4 0-6-2-6-4 3 0 6 1 6 4Z' }], ['circle', { cx: 12, cy: 11, r: 2 }]],
  mask: ['Theatre', ['path', { d: 'M3 4c5 2 9 2 14 0v7c0 5-4 8-7 9-3-1-7-4-7-9V4ZM6 9l2 1M12 10l2-1M7 14c2 2 4 2 6 0M18 8l3-2v8c0 4-2 7-5 8' }]],
  figure: ['Movement', ['circle', { cx: 12, cy: 4, r: 2 }], ['path', { d: 'm4 8 8 2 8-2M12 6v8M12 14 7 22M12 14l5 8' }]],
  screen: ['Screen', ['rect', { x: 2, y: 3, width: 20, height: 14, rx: 2 }], ['path', { d: 'M12 17v4M7 21h10M6 7h5M6 10h9' }]],
  pen: ['Writing', ['path', { d: 'm15 3 6 6M3 21l2-7L17 2c1-1 2-1 3 0l2 2c1 1 1 2 0 3L10 19l-7 2ZM5 14l5 5M13 21h9' }]],
};

export const ICONS = Object.freeze(Object.entries(definitions).map(([id, [label]]) => Object.freeze({ id, label })));

export function createIcon(id, size = 20) {
  const definition = Object.hasOwn(definitions, id) ? definitions[id] : definitions.hobby;
  const svg = document.createElementNS(NS, 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.65, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
  for (const [tag, attributes] of definition.slice(1)) {
    const part = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) part.setAttribute(key, value);
    svg.append(part);
  }
  return svg;
}
