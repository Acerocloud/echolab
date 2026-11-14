/* EchoLab — 课程库 */

import { getManifest, CATEGORIES, LEVELS } from "./data.js";
import { state, streak } from "./store.js";
import { icon, esc, fmtTime } from "./ui.js";

export const meta = { title: "课程库" };

const filter = { cat: "all", level: "all", q: "" };

export async function render(root) {
  const lessons = await getManifest();

  if (!lessons.length) {
    root.innerHTML = `
      <div class="empty-state">
        <h2>还没有课程</h2>
        <p class="muted">运行 <code>python tools/build_lessons.py</code> 生成课程内容。</p>
      </div>`;
    return () => {};
  }

  // 继续上次：最近练过的一节；没练过就用第一节
  const lastAt = (id) => state.lessons[id]?.lastAt || 0;
  const sorted = [...lessons].sort((a, b) => lastAt(b.id) - lastAt(a.id));
  const resume = sorted[0];
  const started = (state.total?.seconds || 0) > 0;
  const passed = state.total?.passed || 0;

  root.innerHTML = `
    <section class="hero">
      <p class="eyebrow">逐句跟读 · Shadowing</p>
      <h1>听见一句，<br />就说出一句。</h1>
      <p class="lede">
        用真实的英文演讲、访谈和学科短片，一个句子一个循环地练：
        听 → 回声 → 说 → 对比。录音只留在你的浏览器里。
      </p>
      <div class="hero-actions">
        <a class="btn btn-primary btn-lg" href="#/lesson/${resume.id}/shadow">
          ${started ? "继续练习" : "开始第一次练习"}
        </a>
      </div>
      <dl class="hero-stats">
        <div><dt>累计</dt><dd>${Math.round((state.total?.seconds || 0) / 60)} 分钟</dd></div>
        <div><dt>过关</dt><dd>${passed} 句</dd></div>
        <div><dt>连续</dt><dd>${streak()} 天</dd></div>
        <div><dt>课程</dt><dd>${lessons.length} 节</dd></div>
      </dl>
    </section>

    <section class="courses" id="courses">
      <div class="course-head">
        <h2>课程</h2>
        <div class="course-filters">
          <div class="chips" role="group" aria-label="分类筛选">
            <button class="chip active" data-cat="all" aria-pressed="true">全部</button>
            ${Object.entries(CATEGORIES)
              .filter(([k]) => lessons.some((l) => l.category === k))
              .map(([k, v]) => `<button class="chip" data-cat="${k}" aria-pressed="false">${v.label}</button>`)
              .join("")}
          </div>
          <label class="search">
            ${icon("search", 15)}
            <input id="searchInput" type="search" placeholder="搜索" autocomplete="off" aria-label="搜索课程" />
          </label>
        </div>
      </div>
      <div id="grid" class="grid" aria-live="polite"></div>
    </section>

    <section class="how">
      <h2>怎么练</h2>
      <ol>
        <li><b>听</b><span>只听这一句，抓住重音、连读和停顿。</span></li>
        <li><b>回声</b><span>停三秒，让声音在脑子里重放一遍。</span></li>
        <li><b>说</b><span>照着回声说，录下自己的声音。</span></li>
        <li><b>对比</b><span>原声 / 我的 / 叠加，看波形差在哪。</span></li>
      </ol>
    </section>
  `;

  const grid = root.querySelector("#grid");
  const search = root.querySelector("#searchInput");

  function draw() {
    const list = lessons.filter((l) => {
      if (filter.cat !== "all" && l.category !== filter.cat) return false;
      if (filter.q) {
        const hay = `${l.title} ${l.titleZh} ${l.speaker} ${(l.tags || []).join(" ")} ${l.desc}`.toLowerCase();
        if (!hay.includes(filter.q.toLowerCase())) return false;
      }
      return true;
    });

    if (!list.length) {
      grid.innerHTML = `<p class="empty-line">没有匹配的课程。</p>`;
      return;
    }
    grid.innerHTML = list.map(card).join("");
  }

  function card(l) {
    const p = state.lessons[l.id] || { passed: [] };
    const pct = l.cueCount ? Math.round(((p.passed?.length || 0) / l.cueCount) * 100) : 0;
    return `
      <a class="card" href="#/lesson/${l.id}">
        <div class="card-media">
          <img src="${esc(l.poster)}" alt="" loading="lazy" />
          <span class="card-dur mono">${fmtTime(l.duration)}</span>
          ${pct ? `<div class="card-bar"><i style="width:${pct}%"></i></div>` : ""}
        </div>
        <div class="card-body">
          <p class="card-meta">${CATEGORIES[l.category]?.label || l.category} · ${esc(l.level)}${l.cueCount === 0 ? " · 视频观看" : ""}</p>
          <h3>${esc(l.titleZh)}</h3>
          <p class="card-en">${esc(l.title)}</p>
          <p class="card-foot">${esc(l.speaker.split(" · ")[0])}${
            pct ? ` · 已练 ${pct}%` : ""
          }</p>
        </div>
      </a>`;
  }

  root.querySelectorAll("[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      filter.cat = btn.dataset.cat;
      root.querySelectorAll("[data-cat]").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
      });
      draw();
    });
  });

  let qTimer = 0;
  search.addEventListener("input", () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      filter.q = search.value.trim();
      draw();
    }, 120);
  });

  draw();
  return () => clearTimeout(qTimer);
}
