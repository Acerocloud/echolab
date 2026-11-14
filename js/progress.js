/* EchoLab — 学习记录 */

import { getManifest } from "./data.js";
import { state, streak, todayKey } from "./store.js";
import { icon, esc, fmtDate } from "./ui.js";

export const meta = { title: "学习记录" };

function dayLevel(sec) {
  if (!sec) return 0;
  const m = sec / 60;
  if (m < 3) return 1;
  if (m < 10) return 2;
  if (m < 20) return 3;
  return 4;
}

export async function render(root) {
  const lessons = await getManifest();
  const minutes = Math.round((state.total?.seconds || 0) / 60);
  const passed = state.total?.passed || 0;
  const words = state.words || [];
  const stars = state.stars || [];

  const finished = lessons.filter((l) => {
    const p = state.lessons[l.id];
    return p && l.cueCount && p.passed.length >= l.cueCount;
  }).length;

  /* 近 12 周热力图 */
  const cells = [];
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 83);
  start.setDate(start.getDate() - start.getDay()); // 对齐周日
  for (let w = 0; w < 12; w += 1) {
    const col = [];
    for (let d = 0; d < 7; d += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      const key = todayKey(day);
      col.push({ key, sec: state.days[key] || 0, future: day > today });
    }
    cells.push(col);
  }

  root.innerHTML = `
    <div class="page-head fade-up">
      <div>
        <span class="eyebrow">${icon("wave", 14)} YOUR PROGRESS</span>
        <h1>学习记录</h1>
        <p class="page-sub">${minutes ? `已经练了 ${minutes} 分钟，${passed} 个句子过了关。` : "还没有开始，从一句话开始就好。"}</p>
      </div>
      <a class="btn btn-primary" href="#/">${icon("arrow", 16)} 继续练</a>
    </div>

    <section class="stat-grid">
      <div class="stat-card">
        <span class="stat-label">连续练习</span>
        <b>${streak()}<i>天</i></b>
        <span class="stat-note">${state.days[todayKey()] ? "今天已打卡" : "今天还没练"}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">累计时长</span>
        <b>${minutes}<i>分钟</i></b>
        <span class="stat-note">${(state.total?.seconds || 0) >= 60 ? `约 ${(minutes / 60).toFixed(1)} 小时` : "从第一句开始"}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">过关句子</span>
        <b>${passed}<i>句</i></b>
        <span class="stat-note">收藏 ${stars.length} 句 · 生词 ${words.length} 个</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">完成课程</span>
        <b>${finished}<i>/ ${lessons.length}</i></b>
        <span class="stat-note">${lessons.length ? Math.round((finished / lessons.length) * 100) : 0}% 课程全句过关</span>
      </div>
    </section>

    <section class="block">
      <div class="block-head">
        <h2>练习热力</h2>
        <span class="muted small">最近 12 周</span>
      </div>
      <div class="heat">
        <div class="heat-days"><i>一</i><i>二</i><i>三</i><i>四</i><i>五</i><i>六</i><i>日</i></div>
        <div class="heat-grid">
          ${cells.map((col) => `<div class="heat-col">${col.map((c) =>
            `<i class="l${c.future ? "x" : dayLevel(c.sec)}" title="${c.key} · ${Math.round(c.sec / 60)} 分钟"></i>`).join("")}</div>`).join("")}
        </div>
      </div>
      <div class="heat-legend"><span>少</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>多</span></div>
    </section>

    <section class="block">
      <div class="block-head"><h2>课程进度</h2></div>
      <div class="course-list">
        ${lessons.map((l) => {
          const p = state.lessons[l.id] || { passed: [], seconds: 0 };
          const pct = l.cueCount ? Math.round(((p.passed?.length || 0) / l.cueCount) * 100) : 0;
          return `<a class="course-row" href="#/lesson/${l.id}">
            <img src="${esc(l.poster)}" alt="" loading="lazy" />
            <div class="course-row-body">
              <div class="course-row-top">
                <b>${esc(l.titleZh)}</b>
                <span class="mono muted">${p.passed?.length || 0} / ${l.cueCount}</span>
              </div>
              <div class="progress-line"><i style="width:${pct}%"></i></div>
              <span class="course-row-note">${pct === 100 ? "全部过关 ✦" : pct > 0 ? `已练 ${Math.round((p.seconds || 0) / 60)} 分钟` : "还没开始"}</span>
            </div>
          </a>`;
        }).join("") || `<p class="muted">还没有课程。</p>`}
      </div>
    </section>

    <section class="block">
      <div class="block-head">
        <h2>收藏句子</h2>
        <span class="muted small">${stars.length} 句</span>
      </div>
      <div class="star-list">
        ${stars.length
          ? stars.slice(0, 30).map((s) => `<a class="star-item" href="#/lesson/${s.lesson}/shadow?cue=${s.cue}">
              <p class="en">${esc(s.en)}</p>
              <p class="zh">${esc(s.zh || "")}</p>
              <span class="muted small">${esc(lessons.find((l) => l.id === s.lesson)?.titleZh || s.lesson)} · ${fmtDate(s.t)}</span>
            </a>`).join("")
          : `<p class="muted small">在跟读面板点「收藏」，句子会出现在这里。</p>`}
      </div>
    </section>
  `;

  return () => {};
}
