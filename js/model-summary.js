function addCount(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function counted(map, keyName = 'label') {
  return [...map].map(([key, count]) => ({ [keyName]: key, count }))
    .sort((a, b) => b.count - a.count || compare(a[keyName], b[keyName]));
}

function seasonFor(localDate, hemisphere) {
  const month = Number(localDate.slice(5, 7));
  const north = ['Winter', 'Spring', 'Summer', 'Autumn'][Math.floor(month % 12 / 3)];
  if (hemisphere === 'north') return north;
  return { Winter: 'Summer', Spring: 'Autumn', Summer: 'Winter', Autumn: 'Spring' }[north];
}

export function summarize(state) {
  const transitions = new Map();
  const triggers = new Map();
  const moods = new Map();
  const seasons = new Map();
  const recentSequence = [];
  const recentCheckins = [];
  let previous;
  let checkins = 0;
  let switches = 0;
  for (const entry of state.journal) {
    if (entry.trigger.trim()) addCount(triggers, entry.trigger);
    if (entry.kind !== 'checkin') continue;
    checkins += 1;
    const id = entry.hobby?.id ?? null;
    const label = entry.hobby?.label ?? 'Rest';
    if (previous && previous.id !== id) {
      switches += 1;
      addCount(transitions, JSON.stringify([previous.label, label]));
    }
    recentCheckins.push({ id, label, at: entry.at });
    if (recentCheckins.length > 8) recentCheckins.shift();
    previous = { id, label };
    addCount(moods, entry.mood);
    addCount(seasons, seasonFor(entry.localDate, state.settings.hemisphere));
  }
  for (let i = 0; i < recentCheckins.length; i += 1) {
    const entry = recentCheckins[i];
    if (i === 0 || entry.id !== recentCheckins[i - 1].id) {
      recentSequence.push({ label: entry.label, at: entry.at });
    }
  }
  return { checkins, switches,
    transitions: [...transitions].map(([key, count]) => {
      const [from, to] = JSON.parse(key);
      return { from, to, count };
    }).sort((a, b) => b.count - a.count || compare(a.from, b.from) || compare(a.to, b.to)),
    triggers: counted(triggers), moods: counted(moods, 'id'), seasons: counted(seasons), recentSequence };
}
