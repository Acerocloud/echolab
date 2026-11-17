// Inflection records do not disambiguate part of speech or competing lemmas.
const uncertainForms = new Set(["leaves", "axes", "bases", "cases", "does", "lives", "lies", "saw", "found", "wound", "bound", "left"]);
export function wordOptions(word, inflections, families) {
  const w = String(word || "").toLowerCase().trim();
  const record = inflections[w];
  if (!record || !record.base || record.base === w || uncertainForms.has(w)) return [{ word: w, label: w, safe: false }];
  const keys = Object.keys(record.forms || {}).filter(key => record.forms[key] === w);
  if (!keys.length) return [{ word: w, label: w, safe: false }];
  const family = families[w] || {};
  const own = [["n", "名词"], ["a", "形容词"], ["r", "副词"]].filter(([key]) => family[key]?.includes(w));
  const verb = keys.some(key => ["i", "p", "d", "3"].includes(key));
  const noun = keys.includes("s");
  const label = verb && noun ? "动词或名词原形" : verb ? "动词原形" : "名词原形";
  const options = [{ word: record.base, label: `${record.base}（${label}）`, safe: own.length === 0 }];
  for (const [, pos] of own) options.push({ word: w, label: `${w}（${pos}，保留原词）`, safe: false });
  if (own.length) options.push({ word: w, label: `${w}（保留原词）`, safe: false });
  return options;
}
export function cleanWords(words, inflections, families, dict) {
  const result = [], index = new Map();
  let changed = 0, merged = 0, uncertain = 0;
  for (const entry of words) {
    if (!entry || typeof entry.w !== "string") { result.push(entry); continue; }
    const options = wordOptions(entry.w, inflections, families);
    // Only records with a matching dictionary lemma and no independent POS are changed.
    const original = entry.w.toLowerCase();
    const option = options[0];
    const change = option.word !== original && option.safe && dict[original]?.lemma === option.word;
    if (!change && inflections[original] && option.word !== original) uncertain++;
    const next = change ? { ...entry, w: option.word, originalForms: [...new Set([...(entry.originalForms || []), original])] } : { ...entry };
    if (change) changed++;
    const previous = index.get(next.w);
    if (previous && (change || previous.changed) && !entry.pos && !previous.entry.pos) {
      previous.entry.originalForms = [...new Set([...(previous.entry.originalForms || []), ...(next.originalForms || []), original])];
      previous.entry.mastered = Boolean(previous.entry.mastered && next.mastered);
      merged++;
    } else { result.push(next); if (!previous) index.set(next.w, { entry: next, changed: change }); }
  }
  return { words: result, changed, merged, uncertain };
}
