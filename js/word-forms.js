/* Show known inflections without guessing spelling rules. */
export function findWordForms(word, entry, inflections) {
  const input = String(word || '').toLowerCase();
  if (!/^[a-z]+(?:['-][a-z]+)*$/.test(input)) return null;
  const matched = inflections[input];
  const base = matched?.base || entry?.lemma || input;
  const record = matched || Object.values(inflections).find(item => item?.base === base);
  const names = [['p','过去式'],['d','过去分词'],['i','现在分词'],['3','第三人称单数'],['s','名词复数']];
  return { base, forms: names.filter(([key])=>record?.forms?.[key]).map(([key,label])=>({label,word:record.forms[key]})) };
}

// WordNet relations can refer to a different sense than the current sentence.
export function formatWordFamily(base, families) {
  const family = families?.[String(base || '').toLowerCase()];
  const labels = [['v','v.'],['n','n.'],['a','adj.'],['r','adv.']];
  const rows = labels.filter(([key]) => Array.isArray(family?.[key]) && family[key].length)
    .map(([key,label]) => label + '  ' + family[key].slice(0, 12).join('、'));
  if (!rows.length) return '本地词典暂未收录这个词的同词族形式。';
  return '同词族（词典关联可能对应不同词义）：\n' + rows.join('\n');
}
