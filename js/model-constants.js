export const MOODS = Object.freeze([
  { id: 'drawn-in', label: 'Drawn in' },
  { id: 'curious', label: 'Curious' },
  { id: 'steady', label: 'Steady' },
  { id: 'restless', label: 'Restless' },
  { id: 'not-in-mood', label: 'Not in the mood' },
  { id: 'resting', label: 'Resting' },
].map(Object.freeze));

export const TRIGGERS = Object.freeze([
  'Season changed', 'Saw something inspiring', 'A friend invited me',
  'Finished a project', 'Needed a change', 'Low energy',
  'More free time', 'New equipment',
]);

export const ICON_KEYS = Object.freeze([
  'hobby', 'guitar', 'camera', 'book', 'code', 'leaf', 'gamepad', 'dice',
  'brush', 'coffee', 'tools', 'star', 'film', 'headphones', 'train', 'drone',
  'brick', 'satellite', 'chef', 'flower', 'mask', 'figure', 'screen', 'pen',
]);

export const STARTER_IDS = Object.freeze([
  'category.music', 'category.outdoor', 'category.maker',
  'category.book', 'category.tabletop', 'category.core',
]);
