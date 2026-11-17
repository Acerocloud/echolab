/* Cloud data format: learning records only. Device settings and API keys stay local. */
const fields = ['lessons', 'words', 'usages', 'pronunciations', 'subtitleEdits', 'stars', 'days', 'total', 'wordExplanations', 'wordFamilies'];
const defaults = { lessons: {}, words: [], usages: [], pronunciations: [], subtitleEdits: {}, stars: [], days: {}, total: { seconds: 0, passed: 0 }, wordExplanations: {}, wordFamilies: {} };
const clone = value => JSON.parse(JSON.stringify(value));

export function learningSnapshot(state) {
  const data = {};
  for (const key of fields) data[key] = clone(state[key] ?? defaults[key]);
  return { format: 'echolab-learning', version: 4, data };
}

export function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.format !== 'echolab-learning' || ![1, 2, 3, 4].includes(snapshot.version) || !snapshot.data || typeof snapshot.data !== 'object' || Array.isArray(snapshot.data)) throw new Error('云端记录格式不受支持');
  const data = snapshot.data;
  for (const key of fields) {
    if (!(key in data)) continue;
    if (key === 'words' || key === 'usages' || key === 'pronunciations' || key === 'stars') {
      if (!Array.isArray(data[key])) throw new Error('云端记录格式不正确');
    } else if (!data[key] || typeof data[key] !== 'object' || Array.isArray(data[key])) throw new Error('云端记录格式不正确');
  }
  return learningSnapshot(data);
}

// Use a stable representation so that reordering object keys does not trigger conflicts.
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

// The caller must obtain consent before applying a restore or resolving a conflict.
export function compareSnapshots(local, remote, baseline) {
  const here = canonical(validateSnapshot(local));
  if (!remote) return { action: 'upload' };
  const there = canonical(validateSnapshot(remote));
  if (here === there) return { action: 'unchanged' };
  if (!baseline) return { action: 'choose' };
  const previous = canonical(validateSnapshot(baseline));
  if (here === previous) return { action: 'download' };
  if (there === previous) return { action: 'upload' };
  return { action: 'conflict' };
}

export function applyLearningSnapshot(state, snapshot) {
  const data = validateSnapshot(snapshot).data;
  for (const key of fields) state[key] = clone(data[key]);
}
