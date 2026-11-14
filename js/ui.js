/* EchoLab — 通用 UI 工具 */

const ICONS = {
  play: '<path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="7" y="5" width="3.4" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.6" y="5" width="3.4" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
  prev: '<path d="M18 6v12L9 12l9-6Z" fill="currentColor" stroke="none"/><rect x="5" y="5.5" width="2.4" height="13" rx="1" fill="currentColor" stroke="none"/>',
  next: '<path d="M6 6v12l9-6-9-6Z" fill="currentColor" stroke="none"/><rect x="16.6" y="5.5" width="2.4" height="13" rx="1" fill="currentColor" stroke="none"/>',
  repeat: '<path d="M4 12a8 8 0 0 1 13.6-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.6 5.7L4 15.5M4 20v-4.5h4.5"/>',
  repeat1: '<path d="M4 12a8 8 0 0 1 13.6-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.6 5.7L4 15.5M4 20v-4.5h4.5"/><path d="M11.4 10.2 12.6 9.6v5.2" stroke-linecap="round"/>',
  volume: '<path d="M4 9.5h3.2L12 5.6v12.8L7.2 14.5H4v-5Z"/><path d="M16 9a4 4 0 0 1 0 6M18.7 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.2L12 5.6v12.8L7.2 14.5H4v-5Z"/><path d="m16.5 9.5 5 5M21.5 9.5l-5 5"/>',
  fullscreen: '<path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/>',
  expand: '<path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/>',
  shrink: '<path d="M9 4v5H4M15 20v-5h5M20 9h-5V4M4 15h5v5"/>',
  gear: '<circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.8 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8.8a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  back: '<path d="M15 19 8 12l7-7"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  star: '<path d="m12 4 2.5 5.2 5.5.8-4 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4-3.9 5.5-.8L12 4Z"/>',
  starOn: '<path d="m12 4 2.5 5.2 5.5.8-4 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4-3.9 5.5-.8L12 4Z" fill="currentColor"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H19"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13.5" width="4" height="6.5" rx="2"/><rect x="17" y="13.5" width="4" height="6.5" rx="2"/>',
  speed: '<circle cx="12" cy="12" r="8.5"/><path d="M12 12 15 9"/><path d="M12 12v4"/>',
  wave: '<path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2M21 12h.5"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 8.2v.1"/>',
  arrow: '<path d="M5 12h13M13 6.5 18.5 12 13 17.5"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.1M10 10h.1M13.5 10h.1M17 10h.1M6.5 14h.1M17 14h.1M9.5 14h5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  listen: '<path d="M4 12v-1a8 8 0 0 1 16 0v1"/><path d="M4 12v3a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 2Z"/><path d="M20 12v3a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2Z"/>',
};

export function icon(name, size = 18, extra = "") {
  const body = ICONS[name] || ICONS.info;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
}

export function esc(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 'mm:ss' */
export function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 人类可读时长 */
export function fmtDuration(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} 分钟`;
  return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
}

export function fmtDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/* ---------------------------------------------------------------- toast */
let toastTimer = 0;
export function toast(msg, ms = 2200) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

/* ---------------------------------------------------------------- modal */
let activeModal = null;

export function openModal({ title, body, actions = [], onClose }) {
  const layer = document.getElementById("layer");
  const html = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title || "详情")}">
      ${title ? `<h3>${esc(title)}</h3>` : ""}
      <div class="modal-body">${body}</div>
      <div class="modal-foot">
        ${actions.map((a, i) => `<button class="btn ${a.primary ? "btn-primary" : ""}" data-act="${i}">${esc(a.label)}</button>`).join("")}
      </div>
    </div>`;
  layer.innerHTML = html;
  const close = () => {
    layer.innerHTML = "";
    activeModal = null;
    document.removeEventListener("keydown", onKey);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener("keydown", onKey);
  layer.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const a = actions[Number(btn.dataset.act)];
      const keep = a.onClick?.();
      if (keep !== true) close();
    });
  });
  layer.addEventListener("click", (e) => {
    if (e.target === layer) close();
  }, { once: true });
  activeModal = close;
  return close;
}

export function closeModal() {
  activeModal?.();
}

export function isModalOpen() {
  return Boolean(document.querySelector("#layer .modal"));
}

/* ---------------------------------------------------------------- 文本 */
const WORD_RE = /([A-Za-z][A-Za-z'’\-]*)|([^A-Za-z]+)/g;

/** 把英文句子切成可点击的单词 */
export function tokenize(text, savedWords = new Set()) {
  let out = "";
  let m;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text))) {
    if (m[1]) {
      const w = m[1];
      const lower = w.toLowerCase();
      const saved = savedWords.has(lower) ? " saved" : "";
      out += `<b class="tok${saved}" data-w="${esc(lower)}">${esc(w)}</b>`;
    } else {
      out += esc(m[2]);
    }
  }
  return out;
}

export function wordCount(text) {
  return (text.match(/[A-Za-z][A-Za-z'’\-]*/g) || []).length;
}

/* ---------------------------------------------------------------- 其它 */
export function debounce(fn, ms = 200) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function vibrate(ms = 8) {
  if (navigator.vibrate) navigator.vibrate(ms);
}
