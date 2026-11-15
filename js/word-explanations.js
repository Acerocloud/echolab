export const DEFAULT_WORD_PROMPT = "你是英语老师。结合给定句子，用简体中文解释目标词的本句含义和常见原意。只有确有引申关系且有把握时，简短说明两者如何关联，不确定就不推测。直接使用日常说法，最多两句话，约60字。只输出纯文本，不用 Markdown、标题或引号。";

export function explanationKey(lesson, cue, word) {
  return JSON.stringify([lesson, cue?.i, cue?.en, word.toLowerCase()]);
}

export function cleanExplanation(text) {
  return String(text).replace(/\*\*|__|\x60/g, "").replace(/^\s*#{1,6}\s*/gm, "").trim();
}
