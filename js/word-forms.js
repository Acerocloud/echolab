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

export const WORD_FAMILY_PROMPT = '你是英语词汇教师。给出目标原词在当前语境中常见且确实存在的同词族形式，包括动词、名词、形容词、副词。只给直接相关且自然常用的词，不猜测，不把单纯相似拼写的词视作同词族；同一个词可出现在多个词性。没有常用形式写“无常用形式”。用简体中文纯文本，格式为“动词：...；名词：...；形容词：...；副词：...”，每项至多列出3个。不要 Markdown、解释和其他内容。';
