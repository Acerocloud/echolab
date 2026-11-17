export const DEFAULT_WORD_PROMPT = "你是英语老师。结合给定句子，用简体中文解释目标词在本句中的含义。如果本句使用的是常见原意，直接解释本句含义，不要另外讲原意或重复说明这是原意。只有本句确实使用引申义，且你有把握说明其与常见原意的关系时，才简短解释原意及引申关系；不确定就不推测。直接使用日常说法，最多两句话，约60字。只输出纯文本，不用 Markdown、标题或引号。";

export function explanationKey(lesson, cue, word) {
  return JSON.stringify([lesson, cue?.i, cue?.en, word.toLowerCase()]);
}

export function cleanExplanation(text) {
  return String(text).replace(/\*\*|__|\x60/g, "").replace(/^\s*#{1,6}\s*/gm, "").trim();
}

export const DEFAULT_SENTENCE_PROMPT = "你是一位善于循循善诱的英语老师。请用简体中文像语文老师讲解课文一样，帮助学习者真正理解给定英文句子。先用自然的中文说明整句意思，再结合句子拆解关键结构、重要词组和表达逻辑，说明翻译为什么这样处理；如有语气、修辞或语境中的言外之意，可结合已知信息解释，不要臆测。直接讲解内容，不要评论句子是否口语化、零碎、啰嗦或有停顿、改口；只有影响理解时才简短澄清。用清晰易懂的语言分段讲解，避免堆砌术语。只输出纯文本。";

export const SENTENCE_FOLLOWUP_PROMPT = "你是英语老师。结合给定句子和此前对话，用简体中文直接回答学习者的具体问题。通常用两三句话，约100字；只解释解决问题所需的内容，不要重复整句翻译或详细讲解，不要添加无关的背景、总结或标题。需要举例时最多给一个简短例子。只输出纯文本。";

const PREVIOUS_SENTENCE_PROMPT = "你是一位善于循循善诱的英语老师。请用简体中文像语文老师讲解课文一样，帮助学习者真正理解给定英文句子。先用自然的中文说明整句意思，再结合句子拆解关键结构、重要词组和表达逻辑，说明翻译为什么这样处理；如有语气、修辞或语境中的言外之意，可结合已知信息解释，不要臆测。用清晰易懂的语言分段讲解，避免堆砌术语。只输出纯文本。";
export function sentencePrompt(value) { return !value || value === PREVIOUS_SENTENCE_PROMPT ? DEFAULT_SENTENCE_PROMPT : value; }

const PREVIOUS_WORD_PROMPT = "你是英语老师。结合给定句子，用简体中文解释目标词的本句含义和常见原意。只有确有引申关系且有把握时，简短说明两者如何关联，不确定就不推测。直接使用日常说法，最多两句话，约60字。只输出纯文本，不用 Markdown、标题或引号。";
export function wordPrompt(value) { return !value || value === PREVIOUS_WORD_PROMPT ? DEFAULT_WORD_PROMPT : value; }
