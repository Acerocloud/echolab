/* EchoLab — 可自定义快捷键 */

import { state, setSetting } from "./store.js";

export const ACTIONS = [
  { id: "repeat", label: "重播本句", hint: "回到这句开头再放一遍" },
  { id: "prev", label: "上一句", hint: "" },
  { id: "next", label: "下一句", hint: "" },
  { id: "loop", label: "单句循环开关", hint: "一直重复这一句" },
  { id: "pauseEach", label: "逐句暂停开关", hint: "" },
  { id: "shadow", label: "进入跟读", hint: "" },
];

export const DEFAULT_KEYS = {
  repeat: "r",
  prev: "ArrowLeft",
  next: "ArrowRight",
  loop: "l",
  pauseEach: "p",
  shadow: "s",
};

export function getKeys() {
  return { ...DEFAULT_KEYS, ...(state.settings.keys || {}) };
}

export function setKey(id, key) {
  const next = { ...getKeys(), [id]: key };
  setSetting("keys", next);
  return next;
}

export function resetKeys() {
  setSetting("keys", { ...DEFAULT_KEYS });
  return { ...DEFAULT_KEYS };
}

const SYMBOL = {
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  " ": "Space",
  " ": "Space",
  escape: "Esc",
  enter: "↵",
  " ": "Space",
};

/** 显示用 */
export function keyLabel(key) {
  if (!key) return "—";
  if (key === " ") return "Space";
  const s = SYMBOL[key.toLowerCase()];
  if (s) return s;
  return key.length === 1 ? key.toUpperCase() : key;
}

/** 把 KeyboardEvent 归一化成可比较的字符串 */
export function normalize(e) {
  if (e.key === " ") return " ";
  if (e.key.length === 1) return e.key.toLowerCase();
  return e.key;
}

export function matchKey(e, binding) {
  if (!binding) return false;
  return normalize(e) === (binding.length === 1 ? binding.toLowerCase() : binding);
}

/** 找到这个按键绑定了哪个动作 */
export function actionOf(e) {
  const keys = getKeys();
  const hit = Object.entries(keys).find(([, v]) => matchKey(e, v));
  return hit ? hit[0] : null;
}
