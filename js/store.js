/* EchoLab — 本地状态（localStorage） */

const KEY = "echolab.v1";

const DEFAULTS = {
  settings: {
    speed: 1,
    subEn: true,
    subZh: true,
    fontScale: 1,
    repeatOne: false,
    pauseEachCue: false,
    keys: {},
    echoOn: true,
    echoMs: 3000,
    shadowMode: "echo", // echo | sync
    autoAdvance: true,
    aiCount: 10,
    ai: { baseUrl: "https://opencode.ai/zen/go/v1", key: "", model: "" },
  },
  lessons: {},   // id -> { cue, passed: [], plays, seconds, lastAt, reps: {} }
  words: [],     // { w, lesson, t }
  stars: [],     // { lesson, cue, en, zh, t }
  days: {},      // 'YYYY-MM-DD' -> seconds
  total: { seconds: 0, passed: 0 },
};

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function merge(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch ?? base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(patch)) {
    out[k] = base && typeof base[k] === "object" && !Array.isArray(base[k])
      ? merge(base[k], patch[k])
      : patch[k];
  }
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULTS);
    return merge(clone(DEFAULTS), JSON.parse(raw));
  } catch {
    return clone(DEFAULTS);
  }
}

export const state = load();

let saveTimer = 0;
function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    window.dispatchEvent(new Event('echolab:learning-saved'));
  } catch (err) {
    console.warn("save failed", err);
  }
}
export function save(immediate = false) {
  clearTimeout(saveTimer);
  if (immediate) flushSave();
  else saveTimer = setTimeout(flushSave, 220);
}
window.addEventListener("pagehide", () => { if (saveTimer) flushSave(); });
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && saveTimer) flushSave();
});

/* ---------------------------------------------------------------- 时间 */
export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dayLabel(key) {
  const [, m, d] = key.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

/** 连续练习天数（今天没练则从昨天算起） */
export function streak() {
  let n = 0;
  const d = new Date();
  if (!state.days[todayKey(d)]) d.setDate(d.getDate() - 1);
  for (;;) {
    const k = todayKey(d);
    if (state.days[k] > 20) {
      n += 1;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return n;
}

/* ---------------------------------------------------------------- 课程进度 */
export function lessonProgress(id) {
  if (!state.lessons[id]) {
    state.lessons[id] = { cue: 0, passed: [], plays: 0, seconds: 0, lastAt: 0, reps: {} };
  }
  const p = state.lessons[id];
  if (!Array.isArray(p.passed)) p.passed = [];
  if (!p.reps) p.reps = {};
  return p;
}

export function isPassed(id, cue) {
  return lessonProgress(id).passed.includes(cue);
}

export function passCue(id, cue, reps = 1) {
  const p = lessonProgress(id);
  if (!p.passed.includes(cue)) {
    p.passed.push(cue);
    state.total.passed = (state.total.passed || 0) + 1;
  }
  p.reps[cue] = (p.reps[cue] || 0) + reps;
  p.lastAt = Date.now();
  save();
}

export function unpassCue(id, cue) {
  const p = lessonProgress(id);
  p.passed = p.passed.filter((c) => c !== cue);
  delete p.reps[cue];
  state.total.passed = Math.max(0, (state.total.passed || 0) - 1);
  save();
}

export function setCuePosition(id, cue) {
  const p = lessonProgress(id);
  p.cue = cue;
  p.lastAt = Date.now();
  save();
}

export function addPracticeTime(seconds) {
  if (!(seconds > 0)) return;
  state.total.seconds = (state.total.seconds || 0) + seconds;
  const k = todayKey();
  state.days[k] = (state.days[k] || 0) + seconds;
  save();
}

export function addLessonTime(id, seconds) {
  lessonProgress(id).seconds += seconds;
}

/* ---------------------------------------------------------------- 生词 / 收藏 */
export function toggleWord(word, lessonId) {
  const w = word.toLowerCase();
  const i = state.words.findIndex((x) => x.w === w);
  if (i >= 0) {
    state.words.splice(i, 1);
    save(true);
    return false;
  }
  state.words.unshift({ w, lesson: lessonId, t: Date.now(), mastered: false });
  state.words = state.words.slice(0, 400);
  save(true);
  return true;
}

export function hasWord(word) {
  const w = word.toLowerCase();
  return state.words.some((x) => x.w === w);
}

/** 已记住的词不再进入造句复习 */
export function setWordMastered(word, value = true) {
  const w = word.toLowerCase();
  const entry = state.words.find((x) => x.w === w);
  if (!entry) return false;
  entry.mastered = Boolean(value);
  if (value) entry.masteredAt = Date.now();
  save(true);
  return true;
}

export function isMastered(word) {
  const w = word.toLowerCase();
  return Boolean(state.words.find((x) => x.w === w)?.mastered);
}

export function dueWords() {
  return state.words.filter((x) => !x.mastered);
}

export function toggleStar(lessonId, cue, en, zh) {
  const i = state.stars.findIndex((x) => x.lesson === lessonId && x.cue === cue);
  if (i >= 0) {
    state.stars.splice(i, 1);
    save(true);
    return false;
  }
  state.stars.unshift({ lesson: lessonId, cue, en, zh, t: Date.now() });
  save(true);
  return true;
}

export function isStarred(lessonId, cue) {
  return state.stars.some((x) => x.lesson === lessonId && x.cue === cue);
}

/* ---------------------------------------------------------------- 设置 */
export function setSetting(key, value) {
  state.settings[key] = value;
  save();
  applyTheme();
}

export function applyTheme() {
  document.documentElement.dataset.theme = "dark";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", "#101319");
}

export function resetAll() {
  localStorage.removeItem(KEY);
  location.reload();
}

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}
