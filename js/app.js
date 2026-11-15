/* EchoLab — 路由与外壳 */

import { applyTheme } from "./store.js";
import { icon, esc, openModal, isModalOpen, toast } from "./ui.js";
import { checkForUpdate } from "./update.js";
import { ACTIONS, getKeys, keyLabel } from "./keys.js";

const routes = [
  { re: /^\/?$/, view: () => import("./library.js"), nav: "library", title: "课程库" },
  { re: /^\/lesson\/([\w-]+)$/, view: () => import("./lesson.js"), nav: "library", title: "课程" },
  { re: /^\/lesson\/([\w-]+)\/shadow$/, view: () => import("./lesson.js"), nav: "library", title: "跟读" },
  { re: /^\/progress$/, view: () => import("./progress.js"), nav: "progress", title: "学习记录" },
  { re: /^\/words$/, view: () => import("./words.js"), nav: "words", title: "生词本" },
  { re: /^\/settings$/, view: () => import("./settings.js"), nav: "settings", title: "设置" },
  { re: /^\/about$/, view: () => import("./about.js"), nav: "about", title: "关于" },
];

const root = document.getElementById("view");
let cleanup = null;
let token = 0;

function parse() {
  const raw = location.hash.replace(/^#/, "") || "/";
  return raw.split("?")[0];
}

async function render() {
  const path = parse();
  const match = routes.find((r) => r.re.test(path));
  const myToken = ++token;

  if (!match) {
    location.hash = "#/";
    return;
  }

  if (typeof cleanup === "function") {
    try { cleanup(); } catch (e) { console.warn(e); }
    cleanup = null;
  }

  const params = path.match(match.re).slice(1).map(decodeURIComponent);
  const mod = await match.view();
  if (myToken !== token) return; // 路由已切换

  document.title = `${mod.meta?.title || match.title} · EchoLab`;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const active = a.dataset.nav === match.nav;
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });

  root.innerHTML = "";
  root.scrollTop = 0;
  window.scrollTo(0, 0);
  const footer = document.getElementById("pageFooter");
  if (footer) footer.hidden = Boolean(mod.fullscreen);

  try {
    cleanup = await mod.render(root, params);
  } catch (err) {
    console.error(err);
    root.innerHTML = `
      <div class="empty-state">
        <h2>页面加载失败</h2>
        <p class="muted">${String(err.message || err)}</p>
        <a class="btn" href="#/">返回课程库</a>
      </div>`;
  }
}

/* 全局快捷键：? 打开帮助 */
document.addEventListener("keydown", (e) => {
  if (e.key !== "?" || e.metaKey || e.ctrlKey || isModalOpen()) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  openModal({
    title: "键盘快捷键",
    body: `
      <table class="keys">
        <tr><td><kbd>Space</kbd></td><td>播放 / 暂停</td></tr>
        ${ACTIONS.map((a) => `<tr><td><kbd>${esc(keyLabel(getKeys()[a.id]))}</kbd></td><td>${esc(a.label)}</td></tr>`).join("")}
        <tr><td><kbd>Esc</kbd></td><td>返回 / 关闭弹层</td></tr>
        <tr><td colspan="2" class="keys-note">在课程页点 ⌨ 可以改这些键；倍速与全屏用播放器自带的设置菜单</td></tr>
      </table>`,
    actions: [{ label: "知道了", primary: true }],
  });
});

window.addEventListener("hashchange", render);

applyTheme();
render();
checkForUpdate().then((update) => {
  if (update.available && location.hash !== "#/settings") toast(`EchoLab v${update.latest} 已发布，可在设置中更新。`);
}).catch(() => {});

export { icon };
