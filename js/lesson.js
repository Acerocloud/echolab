/* EchoLab — 课程页（左视频 / 右字幕，YouTube 原生播放器） */

import { getLesson, getManifest, CATEGORIES } from "./data.js";
import {
  state, save, lessonProgress, setCuePosition, setSetting, toggleWord, hasWord,
  addPracticeTime, addLessonTime,
} from "./store.js";
import {
  icon, esc, toast, fmtTime, tokenize, openModal, isModalOpen, clamp,
} from "./ui.js";
import { createShadowPanel } from "./shadow-panel.js";
import { ACTIONS, getKeys, setKey, resetKeys, keyLabel, normalize, matchKey } from "./keys.js";
import { chat, hasAI } from "./ai.js";
import { wordPrompt, sentencePrompt, explanationKey, cleanExplanation } from "./word-explanations.js";
import { closeModal } from "./ui.js";
import { findWordForms, formatWordFamily } from "./word-forms.js";
import { mountSelect } from "./select-menu.js";
import { wordOptions } from "./word-normalize.js";

export const meta = { title: "课程" };

let dictCache = null;
let inflectionsCache = null;
let wordFamiliesCache = null;
function getWordFamilies() {
  if (!wordFamiliesCache) wordFamiliesCache = fetch("content/word-families.json")
    .then(r => { if (!r.ok) throw new Error("词族词典加载失败"); return r.json(); })
    .catch(error => { wordFamiliesCache = null; throw error; });
  return wordFamiliesCache;
}
function getInflections() {
  if (!inflectionsCache) inflectionsCache = fetch("content/inflections.json").then(r => r.ok ? r.json() : {}).catch(() => ({}));
  return inflectionsCache;
}
let glossCache = null;
let ytApiPromise = null;

async function getDict() {
  if (!dictCache) {
    dictCache = fetch("content/dict.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  }
  return dictCache;
}

async function getGlosses() {
  if (!glossCache) {
    glossCache = fetch("content/glosses.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  }
  return glossCache;
}

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === "function") prev();
        resolve(window.YT);
      };
      if (!document.getElementById("yt-iframe-api")) {
        const s = document.createElement("script");
        s.id = "yt-iframe-api";
        s.src = "https://www.youtube.com/iframe_api";
        s.addEventListener("error", () => {
          s.remove();
          ytApiPromise = null;
          reject(new Error("YouTube IFrame API unavailable"));
        }, { once: true });
        document.head.appendChild(s);
      }
    });
  }
  return ytApiPromise;
}

export async function render(root, [id]) {
  const manifest = await getManifest();
  const entry = manifest.find((course) => course.id === id);
  if (entry?.cueCount === 0 && entry.yt) {
    const ytId = encodeURIComponent(entry.yt);
    root.innerHTML = `
      <div class="lesson-head">
        <a class="back-link" href="#/">${icon("back", 15)} 课程库</a>
        <div class="lesson-title">
          <h1>${esc(entry.titleZh)}</h1>
          <p class="lesson-en">${esc(entry.title)}</p>
          <p class="lesson-kicker">${esc(entry.speaker)} · ${fmtTime(entry.duration)}</p>
        </div>
      </div>
      <div>
        <div class="stage-col">
          <div class="stage">
            <iframe class="yt-host" src="https://www.youtube.com/embed/${ytId}?cc_load_policy=1&cc_lang_pref=en"
              title="${esc(entry.title)}" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
          </div>
          <div class="lesson-meta">
            <p class="meta-desc">${esc(entry.desc)}</p>
            <p class="meta-source">播放器提供 YouTube 自动字幕。逐句跟读需要人工字幕。</p>
            <a href="https://www.youtube.com/watch?v=${ytId}" target="_blank" rel="noopener">在 YouTube 观看</a>
          </div>
        </div>
      </div>`;
    return () => {};
  }

  let lesson;
  try {
    lesson = await getLesson(id);
  } catch {
    root.innerHTML = `<div class="empty-state"><h2>课程不存在</h2><p class="muted">${esc(id)}</p>
      <a class="btn" href="#/">返回课程库</a></div>`;
    return () => {};
  }

  const info = entry || lesson;
  const progress = lessonProgress(id);
  const cues = lesson.cues;
  const savedSet = new Set(state.words.map((w) => w.w));
  const ytId = lesson.source?.yt;
  const offset = Number(lesson.source?.clipStart) || 0;

  const hasChinese = Boolean(info.langs?.includes("zh"));
  let mode = /\/shadow(\?|$)/.test(location.hash) ? "shadow" : "listen";
  let current = clamp(Number(new URLSearchParams(location.hash.split("?")[1] || "").get("cue") ?? progress.cue) || 0, 0, cues.length - 1);
  let repeat = Boolean(state.settings.repeatOne);
  let pauseEach = Boolean(state.settings.pauseEachCue);
  let userScrolledAt = 0;
  let playingSeconds = 0;
  let tickTimer = 0;
  let shadowCtl = null;
  let pollTimer = 0;
  let disposed = false;

  const keys = getKeys();

  /* ---------------------------------------------------------------- 模板 */
  root.innerHTML = `
    <div class="lesson-head">
      <a class="back-link" href="#/">${icon("back", 15)} 课程库</a>
      <div class="lesson-title">
        <h1>${esc(info.titleZh)}</h1>
        <p class="lesson-en">${esc(info.title)}</p>
        <div class="lesson-kicker">
          <span>${CATEGORIES[info.category]?.label || info.category}</span>
          <span class="mono">${esc(info.level)}</span>
          <span class="mono">${fmtTime(info.duration)}</span>
          <span>${info.cueCount} 句</span>
        </div>
      </div>
      <div class="seg-mode" role="group" aria-label="练习模式">
        <button aria-pressed="false" data-mode="listen">精听</button>
        <button aria-pressed="false" data-mode="shadow">跟读</button>
      </div>
    </div>

    <div class="lesson-grid">
      <div class="stage-col">
        <div class="stage" id="stage">
          ${info.poster ? `<img class="stage-poster" src="${esc(info.poster)}" alt="" />` : ""}
          <div class="yt-host" id="ytHost"></div>
          <div class="stage-error" id="stageError" hidden></div>
        </div>
      </div>

      <aside class="side">
        <div class="panel-head">
          <div class="panel-title">
            <span data-panel-title title="选中英文词组可查释义并加入生词本">逐句字幕</span>
            <span class="panel-pos mono" data-pos></span>
          </div>
          <div class="panel-tools">
            <button class="mini" id="tEn" aria-pressed="true" aria-label="显示英文字幕" ${hasChinese ? "" : "hidden disabled"}>Eng</button>
            <button class="mini" id="tZh" aria-label="显示中文字幕" aria-pressed="false" ${hasChinese ? "" : "hidden disabled"}>中</button>
            <button class="mini" id="tFont" title="调整字幕字号" aria-label="调整字幕字号">字号</button>
          </div>
        </div>

        <div class="bar" data-bar="listen">
          <div class="seg-mini" role="group" aria-label="播放方式">
            <button data-pause="0" title="一直播下去">连续播放</button>
            <button data-pause="1" title="每读完一句就停">句末暂停</button>
          </div>
          <div class="bar-actions">
            <button class="tbtn icon-only" data-act="prev" aria-label="上一句" title="上一句 (${keyLabel(keys.prev)})">${icon("back", 16)}</button>
            <button class="tbtn icon-only" data-act="repeat" aria-label="重播本句" title="重播本句 (${keyLabel(keys.repeat)})">
              ${icon("repeat1", 16)}
            </button>
            <button class="tbtn icon-only" data-act="next" aria-label="下一句" title="下一句 (${keyLabel(keys.next)})">${icon("forward", 16)}</button>
            <span class="bar-sep"></span>
            <button class="tbtn${repeat ? " on" : ""}" data-act="loop" title="单句循环 (${keyLabel(keys.loop)})">
              ${icon("repeat", 15)}<span class="tbtn-text">单句循环</span>
            </button>
            <button class="tbtn icon-only" data-act="shortcuts" title="设置快捷键">${icon("keyboard", 15)}</button>
          </div>
        </div>

        <div class="pane pane-script" data-pane="script">
          <p class="phrase-hint">选中英文词组可查释义或加入生词本</p>
          <ol class="lines" id="lines">
            ${cues.map(lineHTML).join("")}
          </ol>
        </div>

        <div class="pane pane-shadow" data-pane="shadow" hidden></div>
      </aside>
      <div class="lesson-meta">
        <p class="meta-desc">${esc(info.desc)}</p>
        <p class="meta-source"><span>${esc(lesson.speaker)}</span><span>${lesson.source.captionType === "auto" ? "YouTube 自动字幕" : "人工字幕"}${
          lesson.source.clipped ? "（节选）" : ""
        }</span> <a class="source-youtube" href="https://www.youtube.com/watch?v=${esc(ytId || "")}" target="_blank" rel="noopener" aria-label="在 YouTube 查看原始视频" title="在 YouTube 查看原始视频"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M23 7a3 3 0 0 0-2.1-2.1C19 4.4 12 4.4 12 4.4s-7 0-8.9.5A3 3 0 0 0 1 7a31 31 0 0 0-.5 5 31 31 0 0 0 .5 5 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5A3 3 0 0 0 23 17a31 31 0 0 0 .5-5 31 31 0 0 0-.5-5ZM9.7 15.3V8.7l5.8 3.3-5.8 3.3Z"/></svg></a></p>
      </div>
    </div>


  `;

  /* ---------------------------------------------------------------- refs */
  const stageError = root.querySelector("#stageError");
  const linesEl = root.querySelector("#lines");
  const lineNodes = Array.from(linesEl.children);
  const paneShadow = root.querySelector('[data-pane="shadow"]');
  const panelTitle = root.querySelector("[data-panel-title]");
  const panelPos = root.querySelector("[data-pos]");
  const listenBar = root.querySelector('[data-bar="listen"]');
  const paneScript = root.querySelector('[data-pane="script"]');
  const segBtns = root.querySelectorAll(".seg-mode button");
  const btnLoop = root.querySelector('[data-act="loop"]');
  const segPause = root.querySelectorAll("[data-pause]");

  /* ---------------------------------------------------------------- 播放器 */
  let player = null;
  let playerReady = false;
  let playerFailed = false;

  // YouTube 的 seekTo 是异步的：跳转后的一小段时间里 getCurrentTime 还返回旧值。
  // 如果直接拿旧值去算当前句，就会把刚切过去的句子拽回来（开着单句循环时尤其明显）。
  // 所以程序化 seek 之后，先用目标时间「顶」住，直到真实时间追上。
  let pendingSeek = null;

  const rawTime = () => {
    if (!playerReady) return 0;
    try { return Math.max(0, player.getCurrentTime() - offset); } catch { return 0; }
  };

  /** 判断一次跳转是否已经落地：带目标句时，要等真实时间进到那一句里才算数 */
  function seekLanded(p) {
    const t = rawTime();
    if (p.cue !== null && cues[p.cue]) {
      const c = cues[p.cue];
      return t >= c.s - 0.06 && t < c.e && Math.abs(t - p.target) < 0.35;
    }
    return Math.abs(t - p.target) < 0.35;
  }

  const relTime = () => {
    const p = pendingSeek;
    if (!p) return rawTime();
    if (seekLanded(p)) {
      pendingSeek = null;
      return rawTime();
    }
    // 暂停状态下播放器可能一直报告跳转前的时间；不要因此覆盖已保存的句子。
    // 播放后给播放器时间推进到目标位置，避免关键帧定位稍早时立即回退。
    if (isPlaying()) {
      p.playingAt ??= performance.now();
      if (performance.now() - p.playingAt > 8000) {
        pendingSeek = null;
        return rawTime();
      }
    } else {
      p.playingAt = null;
    }
    return p.target;
  };
  const totalDur = () => {
    if (playerReady) {
      try {
        const d = player.getDuration() - offset;
        if (d > 1) return info.duration ? Math.min(d, info.duration) : d;
      } catch {}
    }
    return info.duration;
  };
  /** cue: 目标句序号；传了就一直守到真实时间进入该句为止 */
  const seekRel = (t, cue = null) => {
    if (!playerReady) return;
    const target = Math.max(0, t);
    pendingSeek = { target, at: performance.now(), cue };
    try { player.seekTo(Math.max(0, target + offset), true); } catch {}
  };
  const isPlaying = () => {
    if (!playerReady) return false;
    try { return player.getPlayerState() === 1; } catch { return false; }
  };
  const pause = () => { try { player?.pauseVideo?.(); } catch {} };
  const play = () => { try { player?.playVideo?.(); } catch {} };

  function showPlayerError(code) {
    if (disposed) return;
    playerFailed = true;
    const map = {
      2: "视频地址无效", 5: "HTML5 播放器出错", 100: "视频不存在或已删除",
      101: "作者不允许嵌入播放", 150: "作者不允许嵌入播放",
    };
    stageError.hidden = false;
    stageError.innerHTML = `
      <p>${esc(map[code] || "YouTube 播放失败")}</p>
      <a class="btn btn-sm" href="https://www.youtube.com/watch?v=${esc(ytId || "")}" target="_blank" rel="noopener">在 YouTube 观看</a>`;
  }

  function killYouTubeCaptions() {
    if (!playerReady) return;
    try {
      player.unloadModule?.("captions");
      player.unloadModule?.("cc");
      player.setOption?.("captions", "track", {});
      player.setOption?.("cc", "track", {});
    } catch {}
  }

  loadYouTubeApi().then((Y) => {
    if (disposed) return;
    if (!ytId) return showPlayerError(100);
    player = new Y.Player("ytHost", {
      videoId: ytId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        iv_load_policy: 3,
        cc_load_policy: 0,
        hl: "en",
        start: Math.max(0, Math.floor(offset + (cues[current]?.s || 0))),
      },
      events: {
        onReady: () => {
          playerReady = true;
          killYouTubeCaptions();
          seekRel(cues[current]?.s || 0, current);
          setActive(current, { force: true });
          if (mode === "shadow" && !shadowCtl) setMode("shadow", { cue: current });
        },
        onStateChange: (e) => {
          if (e.data !== 1) return;
          killYouTubeCaptions();
          if (mode === "listen" && !document.fullscreenElement && document.activeElement === player?.getIframe?.()) {
            root.focus({ preventScroll: true });
          }
        },
        onError: (e) => showPlayerError(e.data),
      },
    });
  }).catch(() => showPlayerError(5));

  window.__echolab = {
    get player() { return player; },
    get ready() { return playerReady; },
    state: () => { try { return player.getPlayerState(); } catch { return "n/a"; } },
    time: () => { try { return player.getCurrentTime(); } catch { return -1; } },
    dbg: () => ({
      current,
      pending: pendingSeek ? { target: pendingSeek.target, age: Math.round(performance.now() - pendingSeek.at) } : null,
      raw: Number(rawTime().toFixed(2)),
      sticky: Number(relTime().toFixed(2)),
      cue: cues[current] ? { s: cues[current].s, e: cues[current].e } : null,
      repeat,
    }),
  };

  let stoppedAtCueEnd = false;

  /* ---------------------------------------------------------------- 适配器（跟读面板用） */
  const media = {
    get currentTime() { return relTime(); },   // 粘性 seek 已在 relTime 里处理
    set currentTime(v) { seekRel(v); },
    get paused() { return !isPlaying(); },
    get duration() { return totalDur(); },
    set volume(v) { try { player?.setVolume?.(Math.round(v * 100)); } catch {} },
    get volume() { try { return (player?.getVolume?.() ?? 100) / 100; } catch { return 1; } },
    play() { play(); return Promise.resolve(); },
    pause() { pause(); },
  };

  /* ---------------------------------------------------------------- 工具 */
  function lineHTML(c) {
    return `<li class="line" data-i="${c.i}" data-s="${c.s}" data-e="${c.e}">
      <button type="button" class="line-n mono" aria-label="播放 ${fmtTime(c.s)}">${fmtTime(c.s)}</button>
      <div class="line-body">
        <p class="line-en">${esc(c.en)}</p>
        ${c.zh ? `<p class="line-zh">${esc(c.zh)}</p>` : ""}
      </div>
      <div class="line-tools">
        <button class="mini icon-only" data-act="shadow" aria-label="跟读这句">${icon("mic", 13)}</button>
        <button class="mini icon-only" data-act="copy" aria-label="复制英文字幕" title="复制英文字幕">${icon("copy", 14)}</button>
      </div>
    </li>`;
  }

  // 保留所有字幕行的真实高度，仅为视口附近的行创建逐词节点。
  // 这样远距离恢复滚动不依赖估算高度，也不会常驻上万个单词节点。
  let tokenObserver = null;
  function setLineTokens(node, enabled) {
    const en = node.querySelector(".line-en");
    if (!en || (en.dataset.tokenized === "1") === enabled) return;
    if (!enabled) {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.rangeCount && selection.getRangeAt(0).intersectsNode(en)) return;
    }
    const cue = cues[Number(node.dataset.i)];
    if (!cue) return;
    if (enabled) en.innerHTML = tokenize(cue.en, savedSet);
    else en.textContent = cue.en;
    en.dataset.tokenized = enabled ? "1" : "0";
  }
  function startTokenObserver() {
    if (!("IntersectionObserver" in window)) {
      lineNodes.forEach(node => setLineTokens(node, true));
      return;
    }
    tokenObserver = new IntersectionObserver(entries => {
      for (const entry of entries) setLineTokens(entry.target, entry.isIntersecting);
    }, { root: linesEl, rootMargin: "800px 0px" });
    lineNodes.forEach(node => tokenObserver.observe(node));
  }

  function applySubPrefs() {
    const anchor = lineNodes[current];
    const before = anchor?.getBoundingClientRect().top;
    const showEn = !hasChinese || state.settings.subEn;
    const showZh = state.settings.subZh;
    root.querySelector("#tEn").setAttribute("aria-pressed", String(showEn));
    root.querySelector("#tZh").setAttribute("aria-pressed", String(Boolean(showZh && info.langs?.includes("zh"))));
    root.querySelectorAll(".line-en").forEach((el) => (el.style.display = showEn ? "" : "none"));
    root.querySelectorAll(".line-zh").forEach((el) => (el.style.display = showZh ? "" : "none"));
    if (anchor && Number.isFinite(before)) {
      const delta = anchor.getBoundingClientRect().top - before;
      linesEl.scrollTo({ top: linesEl.scrollTop + delta, behavior: "instant" });
    }
  }

  function applyFont() {
    root.style.setProperty("--font-scale", String(state.settings.fontScale || 1));
  }

  function setActive(i, { scroll = true, force = false } = {}) {
    if (i < 0 || i >= cues.length) return;
    const changed = i !== current || force;
    linesEl.querySelector(".line.active")?.classList.remove("active");
    current = i;
    lineNodes[i]?.classList.add("active");
    panelPos.textContent = `${i + 1} / ${cues.length}`;
    if (scroll && changed && mode === "listen") {
      const node = lineNodes[i];
      if (Date.now() - userScrolledAt > 2600 || force) {
        const lr = linesEl.getBoundingClientRect();
        const nr = node.getBoundingClientRect();
        const delta = nr.top - lr.top - (linesEl.clientHeight - nr.height) / 2;
        if (Math.abs(delta) > 8) {
          linesEl.scrollTo({ top: linesEl.scrollTop + delta, behavior: force ? "instant" : "smooth" });
        }
      }
    }
    setCuePosition(id, i);
    if (mode === "shadow") syncHash();
  }

  /**
   * 时间 → 句子序号。
   * 空隙保留上一句，有重叠时以最新开始的句子为准。
   */
  function cueAt(t) {
    let low = 0;
    let high = cues.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (cues[mid].s <= t) low = mid + 1;
      else high = mid;
    }
    return Math.max(0, low - 1);
  }

  function playCue(i) {
    const c = cues[i];
    if (!c) return;
    stoppedAtCueEnd = false;
    seekRel(c.s, i);
    play();
    setActive(i, { force: true });

  }

  function stepCue(direction) {
    if (cues[current + direction]) playCue(current + direction);
  }

  /* ---------------------------------------------------------------- 全局面板控制 */
  function setPauseEach(v) {
    pauseEach = Boolean(v);
    setSetting("pauseEachCue", pauseEach);
    segPause.forEach((b) => {
      const selected = (b.dataset.pause === "1") === pauseEach;
      b.classList.toggle("on", selected);
      b.setAttribute("aria-pressed", String(selected));
    });
  }

  function setLoop(v) {
    repeat = Boolean(v);
    btnLoop.classList.toggle("on", repeat);
    btnLoop.setAttribute("aria-pressed", String(repeat));
    setSetting("repeatOne", repeat);
    if (repeat) playCue(current);
  }

  function togglePlay() {
    if (!playerReady) return toast("播放器还在加载…");
    if (isPlaying()) pause();
    else play();
  }

  /* ---------------------------------------------------------------- 模式 */
  function syncHash() {
    const target = mode === "shadow" ? `#/lesson/${id}/shadow?cue=${current}` : `#/lesson/${id}`;
    if (location.hash !== target) history.replaceState(null, "", target);
  }

  function updateModeButtons(mode) {
    segBtns.forEach((button) => {
      const selected = button.dataset.mode === mode;
      button.classList.toggle("on", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function setMode(next, { cue } = {}) {
    if (next === mode && shadowCtl) return;
    stoppedAtCueEnd = false;
    mode = next;
    document.title = `${next === "shadow" ? "跟读" : "课程"} · EchoLab`;
    root.dataset.mode = next;
    updateModeButtons(next);
    paneScript.hidden = next !== "listen";
    paneShadow.hidden = next !== "shadow";
    listenBar.hidden = next !== "listen";
    panelTitle.textContent = next === "shadow" ? "跟读" : "逐句字幕";
    panelPos.hidden = next !== "listen";

    if (next === "shadow") {
      pause();
      if (cue !== undefined) current = cue;
      shadowCtl?.destroy();
      shadowCtl = createShadowPanel({
        container: paneShadow,
        video: media,
        cues,
        id,
        startCue: current,
        savedSet,
        onChangeCue: (i) => {
          linesEl.querySelector(".line.active")?.classList.remove("active");
          current = i;
          lineNodes[i]?.classList.add("active");
          panelPos.textContent = `${i + 1} / ${cues.length}`;
          syncHash();
        },
        onWordClick: (w, c, node) => openWordCard(w, c, node),
      });
      syncHash();
    } else {
      current = shadowCtl?.cue ?? current;
      shadowCtl?.destroy();
      shadowCtl = null;
      seekRel(cues[current]?.s || 0, current);
      setActive(current, { force: true });
      history.replaceState(null, "", `#/lesson/${id}`);
    }
  }

  segBtns.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

  /* ---------------------------------------------------------------- 轮询 */
  function startPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (!playerReady || playerFailed || mode !== "listen") return;
      // 跳转还在飞：别用旧时间重算当前句，否则刚切过去的句子会被拽回来
      if (pendingSeek) { relTime(); return; }

      const t = rawTime();
      const cur = cues[current];
      const playing = isPlaying();

      if (stoppedAtCueEnd && cur) {
        if (Math.abs(t - cur.e) < 0.4) {
          if (!playing) return;
          if (pauseEach && !repeat) {
            playCue(cues[current + 1] ? current + 1 : current);
            return;
          }
        }
        stoppedAtCueEnd = false;
      }

      if (cur && playing && t >= cur.e - 0.03) {
        if (repeat) { seekRel(cur.s, current); return; }
        if (pauseEach) {
          stoppedAtCueEnd = true;
          pause();
          seekRel(Math.max(cur.s, cur.e - 0.06), current);
          return;
        }
      }

      const i = playing && (pauseEach || repeat) && cur && t >= cur.s && t < cur.e
        ? current
        : cueAt(t);
      if (i !== current) setActive(i);

      if (info.duration && t > info.duration + 0.4) {
        pause();
        seekRel(info.duration - 0.3);
      }
    }, 140);
  }

  /* ---------------------------------------------------------------- 事件 */
  root.querySelector('[data-act="prev"]').addEventListener("click", () => stepCue(-1));
  root.querySelector('[data-act="next"]').addEventListener("click", () => stepCue(1));
  root.querySelector('[data-act="repeat"]').addEventListener("click", () => playCue(current));
  btnLoop.addEventListener("click", () => setLoop(!repeat));
  root.querySelector('[data-act="shortcuts"]').addEventListener("click", openShortcuts);
  segPause.forEach((b) => b.addEventListener("click", () => setPauseEach(b.dataset.pause === "1")));

  root.querySelector("#tEn").addEventListener("click", (e) => {
    state.settings.subEn = !state.settings.subEn;
    e.currentTarget.setAttribute("aria-pressed", String(state.settings.subEn));
    setSetting("subEn", state.settings.subEn);
    applySubPrefs();
  });
  root.querySelector("#tZh").addEventListener("click", (e) => {
    state.settings.subZh = !state.settings.subZh;
    e.currentTarget.setAttribute("aria-pressed", String(state.settings.subZh));
    setSetting("subZh", state.settings.subZh);
    applySubPrefs();
  });
  root.querySelector("#tFont").addEventListener("click", () => {
    const next = state.settings.fontScale >= 1.3 ? 0.9 : Math.round((state.settings.fontScale + 0.14) * 100) / 100;
    setSetting("fontScale", next);
    applyFont();
    toast(`字号 ${Math.round(next * 100)}%`);
  });

  linesEl.addEventListener("scroll", () => { userScrolledAt = Date.now(); }, { passive: true });

  linesEl.addEventListener("click", (e) => {
    const tok = e.target.closest(".tok");
    const li = e.target.closest(".line");
    if (!li) return;
    const i = Number(li.dataset.i);
    const selection = window.getSelection();
    let phrase = selection?.toString().trim().replace(/\s+/g, " ");
    if (phrase && selection.rangeCount && li.querySelector(".line-en")?.contains(selection.anchorNode) &&
        li.querySelector(".line-en")?.contains(selection.focusNode)) {
      const range = selection.getRangeAt(0);
      const startToken = range.startContainer.parentElement?.closest(".tok");
      const endToken = range.endContainer.parentElement?.closest(".tok");
      const expanded = range.cloneRange();
      if (startToken && li.contains(startToken)) expanded.setStartBefore(startToken);
      if (endToken && li.contains(endToken)) expanded.setEndAfter(endToken);
      phrase = expanded.toString().trim().replace(/\s+/g, " ");
      if (phrase.length > 120) return toast("请选择不超过 120 个字符的英文词组");
      openWordCard(phrase.toLowerCase(), cues[i], li);
      selection.removeAllRanges();
      return;
    }
    if (e.target.closest('[data-act="copy"]')) {
      navigator.clipboard.writeText(cues[i].en)
        .then(() => toast("英文已复制"))
        .catch(() => toast("复制失败，请检查浏览器剪贴板权限"));
      return;
    }
    if (tok) { openWordCard(tok.dataset.w, cues[i], tok); return; }
    if (e.target.closest('[data-act="shadow"]')) {
      if (mode === "shadow") shadowCtl?.goto(i);
      else setMode("shadow", { cue: i });
      return;
    }
    playCue(i);
  });

  /* ---------------------------------------------------------------- 快捷键设置 */
  function openShortcuts() {
    const rows = ACTIONS.map((a) => {
      const k = getKeys()[a.id];
      return `<div class="krow" data-id="${a.id}">
        <div class="krow-label"><b>${esc(a.label)}</b>${a.hint ? `<span>${esc(a.hint)}</span>` : ""}</div>
        <button class="krow-key" data-bind="${a.id}">${esc(keyLabel(k))}</button>
      </div>`;
    }).join("");

    openModal({
      title: "快捷键",
      body: `
        <p class="knote">点右侧按钮，然后按一个键完成绑定。<kbd>Space</kbd> 固定为播放 / 暂停。</p>
        <div class="klist">${rows}</div>`,
      actions: [
        { label: "恢复默认", onClick: () => { resetKeys(); refreshKeyLabels(); return true; } },
        { label: "完成", primary: true },
      ],
    });

    const layer = document.getElementById("layer");
    let capturing = null;

    layer.querySelectorAll("[data-bind]").forEach((btn) => {
      btn.addEventListener("click", () => {
        layer.querySelectorAll("[data-bind]").forEach((b) => b.classList.remove("capturing"));
        capturing = btn.dataset.bind;
        btn.classList.add("capturing");
        btn.textContent = "按任意键…";
      });
    });

    const onKey = (e) => {
      if (!capturing) return;
      if (e.key === "Escape") { capturing = null; refreshKeyLabels(); return; }
      e.preventDefault();
      e.stopPropagation();
      const id = capturing;
      capturing = null;
      setKey(id, normalize(e));
      refreshKeyLabels();
      toast(`已绑定 ${keyLabel(normalize(e))}`);
    };
    layer.addEventListener("keydown", onKey, true);
    document.addEventListener("keydown", onKey, true);

    const obs = new MutationObserver(() => {
      if (!document.querySelector("#layer .modal")) {
        document.removeEventListener("keydown", onKey, true);
        obs.disconnect();
      }
    });
    obs.observe(document.getElementById("layer"), { childList: true });
  }

  function refreshKeyLabels() {
    const k = getKeys();
    const map = { prev: k.prev, repeat: k.repeat, next: k.next, loop: k.loop };
    Object.entries(map).forEach(([act, key]) => {
      const btn = root.querySelector(`[data-act="${act}"]`);
      if (!btn) return;
      btn.title = `${btn.dataset.act === "loop" ? "单句循环" : ""}${keyLabel(key)}`;
      const tag = btn.querySelector(".tbtn-key");
      if (tag) tag.textContent = keyLabel(key);
    });
    const kb = (document.querySelector("#layer .klist"));
    if (kb) {
      ACTIONS.forEach((a) => {
        const b = kb.querySelector(`[data-bind="${a.id}"]`);
        if (b) { b.classList.remove("capturing"); b.textContent = keyLabel(k[a.id]); }
      });
    }
  }

  /* ---------------------------------------------------------------- 词卡 */
  async function openWordCard(word, cue, anchor) {
    const [dict, glosses, inflections, families] = await Promise.all([getDict(), getGlosses(), getInflections(), getWordFamilies().catch(() => null)]);
    const form = inflections[word.toLowerCase()];
    const entry = dict[word] || dict[form?.base] || dict[word.replace(/['’]s$/, "")] || null;
    const labels = form ? [["s", "名词复数"], ["3", "动词第三人称单数"], ["i", "现在分词"], ["p", "过去式"], ["d", "过去分词"]].filter(([key]) => form.forms[key] === word.toLowerCase()).map(([, label]) => label) : [];
    const isPhrase = /\s/.test(word);
    const wordForms = isPhrase ? null : findWordForms(word, entry, inflections);
    const saveOptions = isPhrase ? [{ word, label: word }] : (families ? wordOptions(word, inflections, families) : [{ word, label: word }]);
    const initialSaveWord = saveOptions[0].word;
    const gloss = glosses[id]?.[cue?.i]?.[word] || glosses[id]?.[word] || null;
    const cacheKey = explanationKey(id, cue, word);
    const cached = state.wordExplanations?.[cacheKey];
    const sentenceKey = JSON.stringify([id, cue?.i, cue?.en]);
    const sentenceCached = state.sentenceExplanations?.[sentenceKey] || "";

    const defs = entry?.defs?.length
      ? entry.defs.map((d) => `<li>${d.pos ? `<em>${esc(d.pos)}</em>` : ""}${esc(d.zh)}</li>`).join("")
      : `<li class="muted">词典未收录这个词形</li>`;

    openModal({
      title: "",
      body: `
      <div class="wc">
        <div class="wc-head">
          <div>
            <h2 class="wc-word">${esc(word)}</h2>
            ${form ? `<p class="wc-form">词形 · ${esc(labels.join(" / "))}<br>原词 · ${esc(form.base)}${form.forms.p && form.forms.d && (labels.includes("过去式") || labels.includes("过去分词")) ? `<br>过去式 · ${esc(form.forms.p)}　过去分词 · ${esc(form.forms.d)}` : ""}${labels.length > 1 ? `<br><small>具体用法请结合句子判断</small>` : ""}</p>` : entry?.lemma && entry.lemma !== word ? `<p class="wc-ph">原词 · ${esc(entry.lemma)}</p>` : ""}
            ${entry?.ph ? `<p class="wc-ph">/${esc(entry.ph)}/</p>` : ""}
          </div>
          <button class="wc-tts" data-tts aria-label="发音">${icon("volume", 17)}</button>
        </div>
        ${saveOptions.length > 1 || initialSaveWord !== word ? `<div class="wc-save-form"><label for="wcSaveForm">保存到生词本</label><select id="wcSaveForm" aria-label="选择保存词形">${saveOptions.length > 1 ? '<option value="" selected>请选择本句词性</option>' : ""}${saveOptions.map(option => `<option value="${esc(option.word)}">${esc(option.label)}</option>`).join("")}</select><small>请根据句中的词性选择</small></div>` : ""}
        ${id === "muse-launch" && gloss ? `<p class="wc-context"><strong>本句释义</strong>　${esc(gloss.zh)}</p>` : ""}
        ${(id === "muse-launch" || isPhrase) && !gloss ? `<p class="wc-context" data-context>${cached ? esc(cached) : "本句释义尚未生成"}</p><div class="wc-context-actions"><button class="btn btn-plain btn-sm" data-context-generate>${cached ? "重新生成" : "生成本句解释"}</button><button class="icon-btn" data-context-settings aria-label="设置单词解释提示词" title="设置单词解释提示词">${icon("gear", 17)}</button></div>` : ""}
        ${!isPhrase || entry ? `<div class="wc-dictionary"><h3>词典释义</h3><ul class="wc-defs">${defs}</ul></div>` : ""}
        ${wordForms ? `<div class="wc-forms"><button class="btn btn-plain btn-sm" data-word-forms aria-expanded="false">查看其他词形</button><div class="wc-forms-body" data-forms-body hidden><p class="wc-forms-title">原词 · ${esc(wordForms.base)}</p>${wordForms.forms.length ? `<dl class="wc-forms-list">${wordForms.forms.map(item=>`<div><dt>${esc(item.label)}</dt><dd>${esc(item.word)}</dd></div>`).join("")}</dl>` : '<p class="muted small">词典暂无其他屈折形式。</p>'}<div class="wc-family" data-family-output></div></div></div>` : ""}
        ${cue ? `<div class="wc-quote"><p class="wc-en">${highlight(cue.en, word)}</p>
          ${cue.zh ? `<p class="wc-zh">${esc(cue.zh)}</p>` : ""}
          <div class="wc-sentence-actions"><button class="btn btn-plain btn-sm" data-sentence-generate>${sentenceCached ? "重新讲解这句" : "AI 讲解这句"}</button><button class="icon-btn" data-sentence-settings aria-label="设置句子讲解提示词" title="设置句子讲解提示词">${icon("gear", 17)}</button></div>
          <div class="wc-sentence-explanation" data-sentence-output role="status" ${sentenceCached ? "" : "hidden"}>${esc(sentenceCached)}</div>
          <div class="wc-sentence-chat">
            <h3>针对这句提问</h3>
            <div class="wc-chat-history" data-chat-history aria-live="polite"></div>
            <form class="wc-chat-form" data-chat-form>
              <textarea data-chat-input aria-label="针对这句提问" placeholder="例如：这里的 it 指什么？" rows="1" maxlength="3000"></textarea>
              <button class="btn btn-primary btn-sm" type="submit">发送</button>
            </form>
            <p class="wc-chat-status" data-chat-status role="status"></p>
          </div></div>` : ""}
        ${gloss ? `<div class="wc-why"><h3>翻译说明</h3><p>${esc(gloss.why)}</p></div>` : ""}
      </div>`,
      actions: [
        { label: "关闭" },
        {
          label: hasWord(initialSaveWord) ? "移出生词本" : "加入生词本",
          primary: true,
          onClick: (button) => {
            const select = document.getElementById("layer").querySelector("#wcSaveForm");
            if (select && !select.value) { toast("请选择本句的词性和保存词形"); (select.nextElementSibling || select).focus(); return true; }
            const saveWord = select?.value || initialSaveWord;
            const added = toggleWord(saveWord, id);
            if (added) {
              const saved = state.words.find((item) => item.w === saveWord);
              if (saved) { saved.cue = cue?.i; saved.en = cue?.en; saved.zh = cue?.zh; saved.sourceWord = word.toLowerCase(); save(true); }
            }
            if (added) { savedSet.add(saveWord); savedSet.add(word); }
            else { savedSet.delete(saveWord); savedSet.delete(word); }
            root.querySelectorAll(`.tok[data-w="${CSS.escape(word)}"]`)
              .forEach((n) => n.classList.toggle("saved", added));
            toast(added ? `已加入生词本` : `已移出`);
            button.textContent = added ? "移出生词本" : "加入生词本";
            button.classList.toggle("word-saved", added);
            button.classList.remove("word-saved-animation");
            void button.offsetWidth;
            button.classList.add("word-saved-animation");
            return true;
          },
        },
      ],
    });

    document.getElementById("layer").querySelector("[data-tts]")
      ?.addEventListener("click", () => speak(word));
    const layer = document.getElementById("layer");
    const savedButton = layer.querySelector(".modal-foot .btn-primary");
    const wordActions = document.createElement("div");
    wordActions.className = "wc-head-actions";
    const ttsButton = layer.querySelector(".wc-head .wc-tts");
    ttsButton.before(wordActions);
    wordActions.append(ttsButton, savedButton);
    function updateSaveButton() {
      const select = layer.querySelector("#wcSaveForm");
      const selected = select ? select.value : initialSaveWord;
      const saved = selected && hasWord(selected);
      savedButton?.classList.toggle("word-saved", saved);
      if (savedButton) savedButton.textContent = saved ? "移出生词本" : "加入生词本";
    }
    updateSaveButton();
    layer.querySelector("#wcSaveForm")?.addEventListener("change", updateSaveButton);
    mountSelect(layer.querySelector("#wcSaveForm"));
    const formsButton = layer.querySelector('[data-word-forms]');
    const formsBody = layer.querySelector('[data-forms-body]');
    const familyOutput = layer.querySelector('[data-family-output]');
    let familyLoaded = false;
    formsButton?.addEventListener('click', async () => {
      const expanded = formsButton.getAttribute('aria-expanded') !== 'true';
      formsButton.setAttribute('aria-expanded', String(expanded));
      formsButton.textContent = expanded ? '收起其他词形' : '查看其他词形';
      formsBody.hidden = !expanded;
      if (!expanded || familyLoaded) return;
      familyOutput.textContent = '正在读取本地词典…';
      try {
        const families = await getWordFamilies();
        if (!familyOutput.isConnected) return;
        familyOutput.textContent = formatWordFamily(wordForms.base, families);
        familyLoaded = true;
      } catch {
        if (familyOutput.isConnected) familyOutput.textContent = '本地词族词典暂时无法读取，请收起后重试。';
      }
    });
    const sentenceGenerate = layer.querySelector("[data-sentence-generate]");
    const sentenceOutput = layer.querySelector("[data-sentence-output]");
    layer.querySelector("[data-sentence-settings]")?.addEventListener("click", () => {
      closeModal();
      location.hash = "#/settings";
    });
    sentenceGenerate?.addEventListener("click", async () => {
      sentenceOutput.hidden = false;
      if (!hasAI()) {
        sentenceOutput.textContent = "请先在设置中配置 AI 接口和模型。";
        return;
      }
      sentenceGenerate.disabled = true;
      sentenceOutput.textContent = "正在讲解这句话…";
      try {
        const result = await chat([
          { role: "system", content: sentencePrompt(state.settings.sentencePrompt) },
          { role: "user", content: JSON.stringify({ sentence: cue.en, translation: cue.zh || "" }) },
        ], { temperature: 0.4, maxTokens: 4096 });
        const explanation = cleanExplanation(result);
        if (!explanation) throw new Error("接口没有返回讲解");
        state.sentenceExplanations ||= {};
        state.sentenceExplanations[sentenceKey] = explanation;
        save(true);
        if (sentenceOutput.isConnected) {
          sentenceOutput.textContent = explanation;
          sentenceGenerate.textContent = "重新讲解这句";
          sentenceOutput.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      } catch (error) {
        if (sentenceOutput.isConnected) sentenceOutput.textContent = `讲解失败：${error.message}`;
      } finally {
        if (sentenceGenerate.isConnected) sentenceGenerate.disabled = false;
      }
    });
    const chatForm = layer.querySelector("[data-chat-form]");
    const chatInput = layer.querySelector("[data-chat-input]");
    const chatHistory = layer.querySelector("[data-chat-history]");
    const chatStatus = layer.querySelector("[data-chat-status]");
    const conversation = Array.isArray(state.sentenceChats?.[sentenceKey])
      ? state.sentenceChats[sentenceKey].filter(item => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
      : [];
    function addChatMessage(role, content) {
      const item = document.createElement("div");
      item.className = `wc-chat-message ${role === "user" ? "is-user" : "is-assistant"}`;
      const label = document.createElement("b");
      label.textContent = role === "user" ? "你" : "AI";
      const text = document.createElement("p");
      text.textContent = content;
      item.append(label, text);
      chatHistory.appendChild(item);
    }
    conversation.forEach(item => addChatMessage(item.role, item.content));
    function resizeChatInput() {
      if (!chatInput) return;
      chatInput.style.height = "auto";
      chatInput.style.height = `${Math.min(chatInput.scrollHeight, 180)}px`;
      chatInput.style.overflowY = chatInput.scrollHeight > 180 ? "auto" : "hidden";
    }
    chatInput?.addEventListener("input", resizeChatInput);
    resizeChatInput();
    chatInput?.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        chatForm.requestSubmit();
      }
    });
    chatForm?.addEventListener("submit", async event => {
      event.preventDefault();
      const question = chatInput.value.trim();
      if (!question) return;
      if (!hasAI()) {
        chatStatus.textContent = "请先在设置中配置 AI 接口和模型。";
        return;
      }
      const button = chatForm.querySelector('button[type="submit"]');
      button.disabled = true;
      chatInput.disabled = true;
      chatStatus.textContent = "正在回答…";
      try {
        const context = { sentence: cue.en, translation: cue.zh || "", explanation: state.sentenceExplanations?.[sentenceKey] || "" };
        const answer = cleanExplanation(await chat([
          { role: "system", content: sentencePrompt(state.settings.sentencePrompt) + "\n请针对学习者的问题回答，可以结合此前对话，不要重复整段讲解。" },
          { role: "user", content: "当前句子及已有讲解：" + JSON.stringify(context) },
          ...conversation.slice(-20).map(({ role, content }) => ({ role, content })),
          { role: "user", content: question },
        ], { temperature: 0.4, maxTokens: 4096 }));
        if (!answer) throw new Error("接口没有返回回答");
        conversation.push({ role: "user", content: question }, { role: "assistant", content: answer });
        state.sentenceChats ||= {};
        state.sentenceChats[sentenceKey] = conversation;
        save(true);
        if (chatHistory.isConnected) {
          addChatMessage("user", question);
          addChatMessage("assistant", answer);
          chatInput.value = "";
          resizeChatInput();
          chatStatus.textContent = "";
          chatHistory.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      } catch (error) {
        if (chatStatus.isConnected) chatStatus.textContent = `发送失败：${error.message}，请重试。`;
      } finally {
        if (chatInput.isConnected) { button.disabled = false; chatInput.disabled = false; }
      }
    });
    const generate = layer.querySelector("[data-context-generate]");
    layer.querySelector("[data-context-settings]")?.addEventListener("click", () => {
      closeModal();
      location.hash = "#/settings";
    });
    generate?.addEventListener("click", async () => {
      const output = layer.querySelector("[data-context]");
      if (!hasAI()) {
        output.textContent = "请先在设置中配置 AI 接口和模型。";
        return;
      }
      generate.disabled = true;
      output.textContent = "正在结合上下文解释…";
      try {
        const explanation = await chat([
          { role: "system", content: wordPrompt(state.settings.wordPrompt) },
          { role: "user", content: JSON.stringify({ word, lemma: entry?.lemma || word, sentence: cue?.en, translation: cue?.zh }) },
        ], { temperature: 0.3, maxTokens: 700 });
        const cleaned = cleanExplanation(explanation);
        if (!cleaned) throw new Error("接口没有返回解释");
        state.wordExplanations ||= {};
        state.wordExplanations[cacheKey] = cleaned;
        save(true);
        if (output.isConnected) {
          output.textContent = cleaned;
          generate.textContent = "重新生成";
        }
      } catch (error) {
        if (output.isConnected) output.textContent = `解释生成失败：${error.message}`;
      } finally {
        if (generate.isConnected) generate.disabled = false;
      }
    });
    void anchor;
  }

  function highlight(text, word) {
    const re = new RegExp(`\\b(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "ig");
    return esc(text).replace(re, '<em class="hl">$1</em>');
  }

  function speak(text) {
    if (!window.speechSynthesis) return toast("此浏览器不支持发音");
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.95;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  /* ---------------------------------------------------------------- 键盘 */
  function onKey(e) {
    if (isModalOpen() || e.defaultPrevented || e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (mode !== "listen") return;

    if (e.key === " ") { e.preventDefault(); togglePlay(); return; }

    const k = getKeys();
    if (matchKey(e, k.repeat)) { e.preventDefault(); playCue(current); return; }
    if (matchKey(e, k.prev)) { e.preventDefault(); if (!e.repeat) stepCue(-1); return; }
    if (matchKey(e, k.next)) { e.preventDefault(); if (!e.repeat) stepCue(1); return; }
    if (matchKey(e, k.loop)) { e.preventDefault(); setLoop(!repeat); return; }
    if (matchKey(e, k.pauseEach)) { e.preventDefault(); setPauseEach(!pauseEach); return; }
    if (matchKey(e, k.shadow)) { e.preventDefault(); setMode("shadow"); }
  }
  document.addEventListener("keydown", onKey);

  /* ---------------------------------------------------------------- 启动 */
  startTokenObserver();
  startPoll();
  tickTimer = setInterval(() => {
    if (isPlaying()) {
      playingSeconds += 1;
      if (playingSeconds % 15 === 0) {
        addPracticeTime(15);
        addLessonTime(id, 15);
      }
    }
  }, 1000);

  setPauseEach(pauseEach);
  btnLoop.classList.toggle("on", repeat);
  btnLoop.setAttribute("aria-pressed", String(repeat));
  applySubPrefs();
  applyFont();
  setActive(current, { force: true });

  if (mode === "shadow") {
    root.dataset.mode = "shadow";
    updateModeButtons("shadow");
    paneScript.hidden = true;
    paneShadow.hidden = false;
    listenBar.hidden = true;
    panelPos.hidden = true;
    panelTitle.textContent = "跟读";
    paneShadow.innerHTML = `<p class="pane-wait">播放器加载中…</p>`;
  } else {
    root.dataset.mode = "listen";
    updateModeButtons("listen");
  }

  return () => {
    disposed = true;
    document.removeEventListener("keydown", onKey);
    tokenObserver?.disconnect();
    clearInterval(tickTimer);
    clearInterval(pollTimer);
    pollTimer = 0;
    if (playingSeconds % 15) addPracticeTime(playingSeconds % 15);
    shadowCtl?.destroy();
    shadowCtl = null;
    try { player?.destroy?.(); } catch {}
    player = null;
    playerReady = false;
  };
}
