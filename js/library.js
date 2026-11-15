/* EchoLab — 课程库 */

import { getManifest, CATEGORIES } from "./data.js";
import { state } from "./store.js";
import { icon, esc, fmtTime } from "./ui.js";

export const meta = { title: "课程库" };

const filter = { cat: "all", q: "" };

export async function render(root) {
  const lessons = await getManifest();

  if (!lessons.length) {
    root.innerHTML = `
      <div class="empty-state">
        <h2>还没有课程</h2>
        <p class="muted">课程暂时无法加载，请刷新页面重试。</p>
      </div>`;
    return () => {};
  }

  const lastAt = (id) => state.lessons[id]?.lastAt || 0;
  const practiced = lessons.filter((lesson) => lesson.cueCount && lastAt(lesson.id))
    .sort((a, b) => lastAt(b.id) - lastAt(a.id))[0];
  const featured = practiced || lessons.find((lesson) => lesson.id === "muse-launch") || lessons[0];

  root.innerHTML = `
    <section class="library-intro">
      <h1>听见真实世界。</h1>

    </section>
    <section class="featured" aria-labelledby="featured-title">
      <div class="featured-copy">
        <p class="featured-label">${practiced ? "上次练习" : "精选课程"}</p>
        <h2 id="featured-title">${esc(featured.titleZh)}</h2>
        <p class="featured-detail">${esc(featured.speaker)} · ${fmtTime(featured.duration)}</p>
        <a class="btn btn-primary btn-lg" href="#/lesson/${esc(featured.id)}">${icon("play", 18)} ${practiced ? "继续练习" : "开始精听"}</a>
      </div>
      <img src="${esc(featured.poster)}" alt="" fetchpriority="high" />
    </section>

    <section class="courses" id="courses">
      <div class="course-head">
        <h2>浏览课程</h2>
        <div class="course-filters">
          <div class="chips" role="group" aria-label="分类筛选">
            <button class="chip" data-cat="all" aria-pressed="${filter.cat === "all"}">全部</button>
            ${Object.entries(CATEGORIES)
              .filter(([k]) => lessons.some((l) => l.category === k))
              .map(([k, v]) => `<button class="chip" data-cat="${k}" aria-pressed="${filter.cat === k}">${v.label}</button>`)
              .join("")}
          </div>
          <label class="search">
            ${icon("search", 15)}
            <input id="searchInput" type="search" placeholder="搜索课程或讲者" autocomplete="off" aria-label="搜索课程" />
          </label>
        </div>
      </div>
      <p id="resultCount" class="result-count" role="status"></p>
      <div id="grid" class="grid"></div>
    </section>

  `;

  const grid = root.querySelector("#grid");
  const search = root.querySelector("#searchInput");

  const resultCount = root.querySelector("#resultCount");
  search.value = filter.q;

  function draw() {
    const list = lessons.filter((l) => {
      if (filter.cat !== "all" && l.category !== filter.cat) return false;
      if (filter.q) {
        const hay = `${l.title} ${l.titleZh} ${l.speaker} ${(l.tags || []).join(" ")} ${l.desc}`.toLowerCase();
        if (!hay.includes(filter.q.toLowerCase())) return false;
      }
      return true;
    });

    resultCount.textContent = `${list.length} 节课程`;
    if (!list.length) {
      grid.innerHTML = `<p class="empty-line">没有找到课程。试试其他关键词或分类。</p>`;
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
          <img src="${esc(l.poster)}" alt="" loading="lazy" /><span class="category-badges"><span>${esc(CATEGORIES[l.category]?.label || l.category)}</span><span>${esc(l.level)}</span></span>
          <span class="card-dur mono">${fmtTime(l.duration)}</span>
          ${pct ? `<div class="card-bar"><i style="width:${pct}%"></i></div>` : ""}
        </div>
        <div class="card-body">

          <h3>${esc(l.titleZh)}</h3>
          <p class="card-en">${esc(l.title)}</p>
          <p class="card-foot">${esc(l.speaker)}${
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
