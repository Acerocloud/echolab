/* EchoLab — 生词本（AI 造句复习） */

import { state, dueWords, setWordMastered, toggleWord } from "./store.js";
import { icon, esc, toast, openModal } from "./ui.js";
import { generateSentences, hasAI } from "./ai.js";
import { explanationKey } from "./word-explanations.js";
import { mountSelect } from "./select-menu.js";
import { getLesson } from "./data.js";

export const meta = { title: "生词本" };

let dictCache = null;

async function getDict() {
  if (!dictCache) {
    dictCache = fetch("content/dict.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  }
  return dictCache;
}

function speak(text, rate = 0.92) {
  if (!window.speechSynthesis) return toast("浏览器不支持朗读");
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function highlight(text, word) {
  const re = new RegExp(`\\b(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  return esc(text).replace(re, '<em class="hl">$1</em>');
}

export async function render(root) {
  const dict = await getDict();

  let count = Math.min(50, Math.max(1, Number(state.settings.aiCount) || 10));
  let items = [];       // 本次生成的句子
  let idx = 0;
  let loading = false;
  let error = "";
  let showZh = true;
  const used = [];      // 已用过的句子，避免重复

  /** 词典里可能只有这个词的某个变形，两头都试一下 */
  const lemmaOf = (w) => {
    const tries = [
      w.replace(/ies$/, "y"), w.replace(/es$/, ""), w.replace(/s$/, ""),
      w.replace(/ing$/, ""), w.replace(/ing$/, "e"), w.replace(/ed$/, ""), w.replace(/ed$/, "e"),
      `${w}s`, `${w}es`, `${w}d`, `${w}ed`, `${w}ing`, w.replace(/y$/, "ies"),
    ];
    return tries.find((t) => t !== w && dict[t]);
  };

  const defOf = (w) => {
    const entry = dict[w] || dict[lemmaOf(w) || ""] || null;
    if (!entry?.defs?.length) {
      const saved = state.words.find((item) => item.w === w);
      if (!saved) return "";
      return state.wordExplanations?.[explanationKey(saved.lesson, { i: saved.cue, en: saved.en }, w)] || "";
    }
    return entry.defs.map((d) => `${d.pos ? d.pos + " " : ""}${d.zh}`).join("；");
  };

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>生词本</h1>
        <p class="page-sub" id="wlSub"></p>
      </div>
    </div>

    <section class="gen-bar">
      <div class="gen-left">
        <span class="gen-label">生成</span>
        <label class="select-wrap">
          <select id="genCount" aria-label="生成数量">
            ${Array.from({ length: 50 }, (_, i) => i + 1).map((n) => `<option value="${n}" ${n === count ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </label>
        <span class="gen-label">句</span>
        <button class="btn btn-primary btn-sm" id="genBtn">开始生成</button>
      </div>
      <span class="gen-hint" id="genHint">每次都用 AI 重新造句</span>
    </section>

    <div id="cardSlot"></div>

    <section class="block">
      <div class="block-head">
        <h2>全部生词</h2>
        <span class="muted small" id="wlCount"></span>
      </div>
      <p class="muted small" id="cleanupInfo" hidden></p>
      <div id="wordList"></div>
    </section>
  `;

  const sub = root.querySelector("#wlSub");
  const slot = root.querySelector("#cardSlot");
  const listEl = root.querySelector("#wordList");
  const countEl = root.querySelector("#wlCount");
  const genBtn = root.querySelector("#genBtn");
  const genCount = root.querySelector("#genCount");
  const cleanupCountSelect = mountSelect(genCount);
  const genHint = root.querySelector("#genHint");

  try {
    const report = JSON.parse(localStorage.getItem("echolab.word-cleanup.v1") || "null");
    const backup = JSON.parse(localStorage.getItem("echolab.word-cleanup.backup.v1") || "null");
    if (report && Array.isArray(backup?.words)) {
      const info = root.querySelector("#cleanupInfo");
      info.hidden = false;
      info.textContent = `已还原 ${report.changed} 个词形，合并 ${report.merged} 个重复项；${report.uncertain} 个词形因词性不确定保留原样。`;

    }
  } catch (error) { console.warn("生词备份读取失败", error); }

  /* ---------------------------------------------------------------- 卡片 */
  function renderCard() {
    if (loading) {
      slot.innerHTML = `
        <div class="gen-state">
          <span class="spinner"></span>
          <p>正在生成 ${count} 个新句子…</p>
        </div>`;
      return;
    }

    if (error) {
      slot.innerHTML = `
        <div class="gen-state error">
          <p class="gen-error">${esc(error)}</p>
          <div class="gen-actions">
            <button class="btn btn-sm" data-act="retry">重试</button>
            <a class="btn btn-sm btn-quiet" href="#/settings">去设置 AI</a>
          </div>
        </div>`;
      slot.querySelector('[data-act="retry"]')?.addEventListener("click", generate);
      return;
    }

    if (!state.words.length) {
      slot.innerHTML = `
        <div class="gen-state">
          <p>生词本是空的。</p>
          <p class="muted">在课程页点任意一个英文单词，就能把它收进来。</p>
          <a class="btn btn-sm" href="#/">去课程库</a>
        </div>`;
      return;
    }

    if (!items.length || idx >= items.length) {
      const due = dueWords().length;
      slot.innerHTML = `
        <div class="gen-state">
          <p class="gen-strong">${items.length ? "这一批练完了" : "还没有生成例句"}</p>
          <p class="muted">${due
            ? `还有 ${due} 个词没记住，选个数量点「开始生成」。`
            : "所有词都标记为已记住了，可以在下面把词放回复习。"}</p>
        </div>`;
      return;
    }

    const item = items[idx];
    slot.innerHTML = `
      <article class="review-card">
        <div class="review-head">
          <span class="review-step">第 ${idx + 1} / ${items.length} 句</span>
          <span class="review-tip">AI 新造 · ${new Date().toLocaleDateString("zh-CN")}</span>
        </div>

        <div class="rc-word">
          <div>
            <h2>${esc(item.word)}</h2>
            <p class="rc-def">${esc(defOf(item.word) || "—")}</p>
          </div>
          <button class="rc-tts" data-act="word" aria-label="读这个词">${icon("volume", 18)}</button>
        </div>

        <p class="rc-sentence">${highlight(item.en, item.word)}</p>
        <p class="rc-zh" ${showZh ? "" : "hidden"}>${esc(item.zh)}</p>

        <div class="rc-tools">
          <button class="rc-btn" data-act="speak">${icon("play", 14)} 听整句</button>
          <button class="rc-btn" data-act="zh">${showZh ? "隐藏中文" : "显示中文"}</button>
        </div>
      </article>

      <div class="review-actions">
        <button class="btn btn-plain" data-act="skip">跳过</button>
        <button class="btn btn-primary" data-act="known">记住了</button>
      </div>`;

    slot.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.act;
        if (act === "word") speak(item.word, 0.85);
        if (act === "speak") speak(item.en);
        if (act === "zh") {
          showZh = !showZh;
          const zh = slot.querySelector(".rc-zh");
          if (zh) zh.hidden = !showZh;
          btn.textContent = showZh ? "隐藏中文" : "显示中文";
        }
        if (act === "skip") {
          idx += 1;
          renderCard();
        }
        if (act === "known") {
          setWordMastered(item.word, true);
          idx += 1;
          renderAll();
        }
      });
    });
  }

  /* ---------------------------------------------------------------- 生成 */
  async function generate() {
    if (loading) return;
    if (!hasAI()) {
      error = "还没有配置 AI 接口，去「设置 → AI 造句」填上地址和 Key。";
      renderCard();
      return;
    }
    const due = dueWords();
    if (!due.length) {
      toast("没有要复习的词了");
      return;
    }

    loading = true;
    error = "";
    items = [];
    idx = 0;
    genBtn.disabled = true;
    genBtn.textContent = "生成中…";
    renderCard();

    try {
      const words = due.map((w) => w.w);
      const list = await generateSentences(words, count, { avoid: used });
      if (!list.length) throw new Error("模型没有返回可用的句子，换一次试试");
      items = list;
      list.forEach((x) => used.push(x.en));
      if (used.length > 200) used.splice(0, used.length - 200);
      idx = 0;
      showZh = true;
      genHint.textContent = `刚生成了 ${list.length} 句`;
    } catch (e) {
      error = e.message || String(e);
    } finally {
      loading = false;
      genBtn.disabled = false;
      genBtn.textContent = "开始生成";
      renderAll();
    }
  }

  async function openSavedWord(word) {
    const saved = state.words.find(item => item.w === word);
    if (!saved) return;
    const entry = dict[word] || dict[lemmaOf(word) || ""] || null;
    let cue = saved.en ? { i: saved.cue, en: saved.en, zh: saved.zh } : null;
    if (!cue && saved.lesson && Number.isInteger(saved.cue)) {
      try { cue = (await getLesson(saved.lesson)).cues[saved.cue] || null; } catch { /* 课程不可用时仍显示词典释义 */ }
    }
    const sourceWord = saved.sourceWord || saved.w;
    const explanation = cue && state.wordExplanations?.[explanationKey(saved.lesson, cue, sourceWord)];
    const definitions = entry?.defs?.length
      ? `<ul class="wc-defs">${entry.defs.map(def => `<li>${def.pos ? `<em>${esc(def.pos)}</em>` : ""}${esc(def.zh)}</li>`).join("")}</ul>`
      : `<p class="muted">本地词典暂无释义${explanation ? "，下方显示已保存的解释。" : "。"}</p>`;
    openModal({
      title: "",
      body: `<div class="wc"><div class="wc-head"><div><h2 class="wc-word">${esc(word)}</h2>${entry?.ph ? `<p class="wc-ph">/${esc(entry.ph)}/</p>` : ""}${sourceWord !== word ? `<p class="wc-form">原句词形 · ${esc(sourceWord)}</p>` : ""}</div><button class="wc-tts" data-word-speak aria-label="播放单词发音">${icon("volume", 17)}</button></div>
        <div class="wc-dictionary"><h3>词典释义</h3>${definitions}</div>
        ${explanation ? `<div class="wc-context"><strong>已保存的本句解释</strong><p>${esc(explanation)}</p></div>` : ""}
        ${cue?.en ? `<div class="wc-quote"><p class="wc-en">${esc(cue.en)}</p>${cue.zh ? `<p class="wc-zh">${esc(cue.zh)}</p>` : ""}</div>` : ""}</div>`,
      actions: [{ label: "关闭", primary: true }],
    });
    document.querySelector("#layer [data-word-speak]")?.addEventListener("click", () => speak(word, 0.85));
  }

  /* ---------------------------------------------------------------- 词表 */
  function renderList() {
    const words = state.words;
    countEl.textContent = `${words.length} 个`;
    if (!words.length) {
      listEl.innerHTML = `<p class="empty-line">还没有生词。</p>`;
      return;
    }

    listEl.innerHTML = `<div class="wl">${words
      .slice()
      .sort((a, b) => Number(a.mastered) - Number(b.mastered) || (b.t || 0) - (a.t || 0))
      .map((w) => `
        <div class="wl-row${w.mastered ? " is-done" : ""}" data-w="${esc(w.w)}">
          <button class="wl-main" type="button" data-word-details="${esc(w.w)}" aria-label="查看 ${esc(w.w)} 的解释">
            <b>${esc(w.w)}</b>
            <span>${esc(defOf(w.w) || "")}</span>
          </button>
          <button class="wl-toggle" data-mastered="${esc(w.w)}">${w.mastered ? "已记住" : "复习中"}</button>
          <button class="mini icon-only" data-del="${esc(w.w)}" aria-label="删除">${icon("close", 13)}</button>
        </div>`).join("")}</div>`;

    listEl.querySelectorAll("[data-word-details]").forEach((btn) => {
      btn.addEventListener("click", () => void openSavedWord(btn.dataset.wordDetails));
    });

    listEl.querySelectorAll("[data-mastered]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const w = btn.dataset.mastered;
        const entry = state.words.find((x) => x.w === w);
        setWordMastered(w, !entry?.mastered);
        renderAll();
      });
    });

    listEl.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        toggleWord(btn.dataset.del, "");
        items = items.filter((x) => x.word !== btn.dataset.del);
        renderAll();
        toast("已移出生词本");
      });
    });
  }

  function renderAll() {
    const total = state.words.length;
    const due = dueWords().length;
    sub.textContent = total ? `${total} 个词 · ${due} 个还在复习` : "在课程里点单词就会收进来";
    if (!hasAI()) {
      genHint.innerHTML = `<a href="#/settings" class="gen-link">还没配置 AI 接口，去设置 →</a>`;
    } else if (!genHint.textContent.trim() || genHint.textContent.includes("设置")) {
      genHint.textContent = "每次都用 AI 重新造句";
    }
    renderCard();
    renderList();
  }

  genBtn.addEventListener("click", generate);
  genCount.addEventListener("change", () => {
    count = Math.min(50, Math.max(1, Number(genCount.value) || 10));
    state.settings.aiCount = count;
  });

  renderAll();
  return () => { cleanupCountSelect(); speechSynthesis?.cancel?.(); };
}
