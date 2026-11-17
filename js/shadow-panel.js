/* EchoLab — 跟读面板（嵌在课程页右侧，与视频同屏） */

import {
  state, passCue, setCuePosition, isPassed, isStarred, toggleStar,
  addPracticeTime, addLessonTime,
} from "./store.js";
import { icon, esc, toast, tokenize, isModalOpen, clamp } from "./ui.js";
import { getKeys, matchKey } from "./keys.js";

const BUCKETS = 96;

export function createShadowPanel(opts) {
  const { container, video, cues, id, onChangeCue, onWordClick } = opts;
  const savedSet = opts.savedSet || new Set();

  let queueKind = "all";
  let queue = buildQueue("all");
  let current = clamp(opts.startCue ?? 0, 0, cues.length - 1);
  let active = true;

  let phase = "idle";
  let mode = state.settings.shadowMode || "echo";
  let recActive = false;
  let micDeniedShown = false;

  let mediaStream = null;
  let recorder = null;
  let chunks = [];
  let recURL = null;
  let recAudio = null;
  let recStartedAt = 0;
  let recTimer = 0;
  let recAutoStop = 0;
  let echoTimer = 0;
  let playRaf = 0;
  let capRaf = 0;
  let practiceTimer = 0;
  let practiceSeconds = 0;

  let mineEnv = [];
  let audioCtx = null;
  let micAnalyser = null;

  /* ---------------------------------------------------------------- 结构 */
  const root = document.createElement("div");
  root.className = "sp";
  root.innerHTML = `
    <div class="sp-top">
      <span class="sp-count mono"><b data-idx>1</b> / <span data-total>${queue.length}</span></span>
      <div class="sp-tools">
        <button class="sp-chip" data-range title="切换练习范围">全部句子</button>
        <button class="sp-chip" data-mode title="先听后读 / 同步跟读">先听后读</button>
        <button class="sp-star" data-star aria-label="收藏这句">${icon("star", 15)}</button>
      </div>
    </div>

    <div class="sp-sentence">
      <p class="sp-en" data-en></p>
      <p class="sp-zh" data-zh></p>
    </div>

    <ol class="sp-steps">
      <li data-step="listen"><i>1</i>听</li>
      <li data-step="echo"><i>2</i>准备</li>
      <li data-step="record"><i>3</i>录音</li>
      <li data-step="review"><i>4</i>回听</li>
    </ol>

    <div class="sp-wave">
      <canvas data-wave></canvas>
      <div class="sp-legend">
        <span class="lg mine"><i></i>我的录音</span>
        <span class="sp-note" data-note>录音波形</span>
      </div>
    </div>

    <div class="sp-main">
      <button class="sp-side" data-act="orig">${icon("play", 16)}<span>听原声</span></button>
      <button class="sp-rec" data-act="rec" aria-label="录音">
        <span class="ring"></span>${icon("mic", 22)}
      </button>
      <button class="sp-side" data-act="mine" disabled>${icon("headphones", 16)}<span>播放录音</span></button>
    </div>

    <p class="sp-phase" data-phase><i></i><span>点「听原声」开始，或按空格</span></p>

    <div class="sp-compare" role="group" aria-label="录音回听" hidden>
      <button data-play="orig">原声<kbd>1</kbd></button>
      <button data-play="mine" disabled>录音<kbd>2</kbd></button>
      <button data-play="both" disabled>同时播放<kbd>3</kbd></button>
    </div>

    <div class="sp-rate">
      <button class="sp-btn" data-act="again">再来一次</button>
      <button class="sp-btn sp-btn-primary" data-act="pass">完成，下一句</button>
    </div>

    <div class="sp-nav">
      <button data-nav="prev" aria-label="上一句">${icon("back", 14)}</button>
      <div class="sp-dots" data-dots></div>
      <button data-nav="next" aria-label="下一句">${icon("arrow", 14)}</button>
    </div>
  `;
  container.innerHTML = "";
  container.appendChild(root);

  const elIdx = root.querySelector("[data-idx]");
  const elTotal = root.querySelector("[data-total]");
  const elEn = root.querySelector("[data-en]");
  const elZh = root.querySelector("[data-zh]");
  const elPhase = root.querySelector("[data-phase] span");
  const elPhaseWrap = root.querySelector("[data-phase]");
  const elNote = root.querySelector("[data-note]");
  const elSteps = root.querySelector(".sp-steps");
  const btnRec = root.querySelector('[data-act="rec"]');
  const btnOrig = root.querySelector('[data-act="orig"]');
  const btnMine = root.querySelector('[data-act="mine"]');
  const btnAgain = root.querySelector('[data-act="again"]');
  const btnPass = root.querySelector('[data-act="pass"]');
  const btnStar = root.querySelector("[data-star]");
  const btnRange = root.querySelector("[data-range]");
  const btnMode = root.querySelector("[data-mode]");
  const comparison = root.querySelector(".sp-compare");
  const cmpMine = root.querySelector('[data-play="mine"]');
  const cmpBoth = root.querySelector('[data-play="both"]');
  const canvas = root.querySelector("[data-wave]");
  const ctx2d = canvas.getContext("2d");
  const dotsEl = root.querySelector("[data-dots]");

  /* ---------------------------------------------------------------- 队列 */
  function buildQueue(kind) {
    const all = cues.map((c) => c.i);
    if (kind === "todo") return all.filter((i) => !isPassed(id, i));
    if (kind === "star") {
      const stars = new Set(state.stars.filter((s) => s.lesson === id).map((s) => s.cue));
      return all.filter((i) => stars.has(i));
    }
    return all;
  }

  const pos = () => Math.max(0, queue.indexOf(current));

  /* ---------------------------------------------------------------- 渲染 */
  function render(i) {
    abortRecording();
    current = i;
    const c = cues[i];
    clearRecording();
    mineEnv = [];
    setPhase("idle");
    draw();

    elEn.innerHTML = tokenize(c.en, savedSet);
    const len = c.en.length;
    elEn.classList.toggle("long", len > 110 && len <= 180);
    elEn.classList.toggle("xlong", len > 180);
    elZh.textContent = c.zh || "";
    elZh.style.display = c.zh ? "" : "none";

    elIdx.textContent = String(pos() + 1);
    elTotal.textContent = String(queue.length);
    const starred = isStarred(id, i);
    btnStar.classList.toggle("on", starred);
    btnStar.innerHTML = icon(starred ? "starOn" : "star", 15);

    btnPass.textContent = isPassed(id, i) ? "已完成，下一句" : "完成，下一句";
    btnPass.classList.toggle("done", isPassed(id, i));
    setCuePosition(id, i);
    renderDots();
    onChangeCue?.(i, c);
  }

  function renderDots() {
    const step = Math.max(1, Math.ceil(queue.length / 34));
    let html = "";
    for (let k = 0; k < queue.length; k += step) {
      const i = queue[k];
      html += `<i class="${i === current ? "cur" : ""}${isPassed(id, i) ? " done" : ""}" data-jump="${i}"></i>`;
    }
    dotsEl.innerHTML = html;
  }

  function setPhase(p) {
    phase = p;
    const map = {
      idle: "点「听原声」开始，或按空格",
      listen: "在听 · 抓重音、连读和停顿",
      echo: "准备开口",
      record: "正在录音",
      review: "选择原声或录音开始回听",
      playing: "回放中…",
    };
    elPhase.textContent = map[p] || "";
    elPhaseWrap.className = `sp-phase ${p}`;
    const order = ["listen", "echo", "record", "review"];
    elSteps.querySelectorAll("li").forEach((li) => {
      const step = li.dataset.step;
      const cur = p === "playing" ? "listen" : p;
      li.classList.toggle("active", step === cur);
      li.classList.toggle("done", cur !== "idle" && order.indexOf(step) < order.indexOf(cur));
    });
    btnRec.classList.toggle("recording", p === "record");
    btnOrig.disabled = p === "record";
  }

  /* ---------------------------------------------------------------- 音频 */
  async function ensureCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") await audioCtx.resume();
    return audioCtx;
  }

  function captureInto() {
    const analyser = micAnalyser;
    if (!analyser) return;
    const buf = new Uint8Array(analyser.fftSize);
    const arr = mineEnv;
    arr.length = 0;
    cancelAnimationFrame(capRaf);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let k = 0; k < buf.length; k += 1) {
        const v = (buf[k] - 128) / 128;
        sum += v * v;
      }
      arr.push(Math.sqrt(sum / buf.length));
      capRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  function stopCapture() {
    cancelAnimationFrame(capRaf);
    capRaf = 0;
  }

  /* ---------------------------------------------------------------- 播放 */
  function playSegment(start, end) {
    return new Promise((resolve) => {
      cancelAnimationFrame(playRaf);
      const dur = Math.max(0.2, end - start);
      video.currentTime = start;
      video.volume = 1;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        cancelAnimationFrame(playRaf);
        video.pause();
        stopCapture();
        resolve();
      };
      video.play().catch(() => finish());
      const t0 = performance.now();
      playRaf = requestAnimationFrame(function step() {
        if (done) return;
        const t = video.currentTime;
        if (t >= end - 0.02 || performance.now() - t0 > (dur + 1.2) * 1000) {
          finish();
          return;
        }
        draw({ playhead: clamp((t - start) / Math.max(0.2, end - start), 0, 1) });
        playRaf = requestAnimationFrame(step);
      });
    });
  }

  async function playOriginal() {
    if (recActive) return;
    setPhase("listen");
    await playSegment(cues[current].s, cues[current].e);
    if (phase === "listen") {
      setPhase("idle");
      draw();
      if (state.settings.autoAdvance) startEcho();
    }
  }

  function startEcho() {
    if (!state.settings.echoOn) {
      startRecording();
      return;
    }
    let left = Math.max(1, Math.round((state.settings.echoMs || 3000) / 1000));
    setPhase("echo");
    elPhase.textContent = `回声 ${left}…`;
    clearInterval(echoTimer);
    echoTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(echoTimer);
        startRecording();
      } else {
        elPhase.textContent = `回声 ${left}…`;
      }
    }, 1000);
  }

  /* ---------------------------------------------------------------- 录音 */
  async function getMic() {
    if (mediaStream) return mediaStream;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      const ctx = await ensureCtx();
      if (ctx) {
        const src = ctx.createMediaStreamSource(mediaStream);
        micAnalyser = ctx.createAnalyser();
        micAnalyser.fftSize = 512;
        src.connect(micAnalyser);
      }
      return mediaStream;
    } catch (err) {
      if (!micDeniedShown) {
        micDeniedShown = true;
        toast("没有麦克风权限，只能听不能说。检查浏览器地址栏的权限设置。", 4200);
      }
      return null;
    }
  }

  function maxRecMs() {
    return Math.max(1, cues[current].e - cues[current].s) * 1800 + 1200;
  }

  async function startRecording() {
    if (recActive) return;
    const stream = await getMic();
    if (!stream) return;
    clearRecAudio();
    mineEnv = [];
    chunks = [];
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""]
      .find((m) => !m || (window.MediaRecorder && MediaRecorder.isTypeSupported(m)));
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      toast("当前浏览器不支持录音");
      return;
    }
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
      recURL = URL.createObjectURL(blob);
      recAudio = new Audio(recURL);
      recAudio.preload = "auto";
      comparison.hidden = false;
      cmpMine.disabled = false;
      cmpBoth.disabled = false;
      btnMine.disabled = false;
      setPhase("review");
      draw();
      elNote.textContent = `录音 ${((performance.now() - recStartedAt) / 1000).toFixed(1)}s`;
      recAudio.play().catch(() => {});
    };
    recorder.start(120);
    recActive = true;
    recStartedAt = performance.now();
    setPhase("record");
    captureInto();
    tickClock();
    clearTimeout(recAutoStop);
    recAutoStop = setTimeout(() => stopRecording(), maxRecMs());
  }

  function tickClock() {
    if (!recActive) return;
    const s = (performance.now() - recStartedAt) / 1000;
    elPhase.textContent = `在录 ${s.toFixed(1)}s`;
    recTimer = requestAnimationFrame(tickClock);
  }

  function stopRecording() {
    if (!recActive) return;
    recActive = false;
    cancelAnimationFrame(recTimer);
    clearTimeout(recAutoStop);
    stopCapture();
    try { recorder.stop(); } catch {}
  }

  function abortRecording() {
    if (recActive) {
      recActive = false;
      cancelAnimationFrame(recTimer);
      clearTimeout(recAutoStop);
      stopCapture();
      if (recorder) recorder.onstop = null;
      try { recorder.stop(); } catch {}
    }
    clearInterval(echoTimer);
  }

  function clearRecording() {
    clearRecAudio();
    mineEnv = [];
    comparison.hidden = true;
    cmpMine.disabled = true;
    cmpBoth.disabled = true;
    btnMine.disabled = true;
  }

  function clearRecAudio() {
    if (recAudio) {
      try { recAudio.pause(); } catch {}
      recAudio = null;
    }
    if (recURL) {
      URL.revokeObjectURL(recURL);
      recURL = null;
    }
  }

  /* ---------------------------------------------------------------- 回放 */
  function playMine() {
    if (!recAudio) return;
    setPhase("playing");
    video.pause();
    recAudio.currentTime = 0;
    recAudio.play().catch(() => {});
    recAudio.onended = () => setPhase("review");
  }

  async function playBoth() {
    if (!recAudio) return;
    setPhase("playing");
    recAudio.currentTime = 0;
    setTimeout(() => recAudio.play().catch(() => {}), 30);
    await playSegment(cues[current].s, cues[current].e);
    setPhase("review");
  }

  function playOrigOnly() {
    setPhase("playing");
    playSegment(cues[current].s, cues[current].e).then(() => setPhase("review"));
  }

  /* ---------------------------------------------------------------- 波形 */
  function downsample(arr, n) {
    if (!arr.length) return new Array(n).fill(0);
    const out = new Array(n).fill(0);
    const per = arr.length / n;
    for (let b = 0; b < n; b += 1) {
      const s = Math.floor(b * per);
      const e = Math.max(s + 1, Math.floor((b + 1) * per));
      let sum = 0;
      for (let k = s; k < e && k < arr.length; k += 1) sum += arr[k];
      out[b] = sum / (e - s);
    }
    return out;
  }

  function norm(arr) {
    const max = Math.max(...arr, 0.0001);
    return arr.map((v) => Math.min(1, Math.pow(v / max, 0.62)));
  }

  function css(v) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }

  function draw({ playhead = null } = {}) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 380;
    const h = canvas.clientHeight || 84;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, w, h);

    const mid = h / 2;
    const cOrig = css("--wave-1") || "#0071e3";
    const cMine = css("--wave-2") || "#ff9f0a";

    ctx2d.strokeStyle = css("--line") || "rgba(0,0,0,.1)";
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(0, mid);
    ctx2d.lineTo(w, mid);
    ctx2d.stroke();

    const paint = (arr, color, alpha) => {
      const data = norm(downsample(arr, BUCKETS));
      const step = w / data.length;
      ctx2d.beginPath();
      ctx2d.moveTo(0, mid);
      data.forEach((v, i) => ctx2d.lineTo(i * step, mid - v * (mid * 0.84)));
      for (let i = data.length - 1; i >= 0; i -= 1) ctx2d.lineTo(i * step, mid + data[i] * (mid * 0.84));
      ctx2d.closePath();
      ctx2d.fillStyle = color;
      ctx2d.globalAlpha = alpha;
      ctx2d.fill();
      ctx2d.globalAlpha = Math.min(1, alpha * 2);
      ctx2d.strokeStyle = color;
      ctx2d.lineWidth = 1.2;
      ctx2d.stroke();
      ctx2d.globalAlpha = 1;
    };

    if (mineEnv.length) paint(mineEnv, cMine, 0.3);

    if (!mineEnv.length) {
      ctx2d.fillStyle = css("--muted") || "#86868b";
      ctx2d.font = `12px ${css("--font") || "sans-serif"}`;
      ctx2d.textAlign = "center";
      ctx2d.fillText("录音后显示波形", w / 2, mid + 4);
    }

    if (playhead !== null) {
      const x = playhead * w;
      ctx2d.strokeStyle = css("--text") || "#1d1d1f";
      ctx2d.globalAlpha = 0.35;
      ctx2d.beginPath();
      ctx2d.moveTo(x, 4);
      ctx2d.lineTo(x, h - 4);
      ctx2d.stroke();
      ctx2d.globalAlpha = 1;
    }
  }

  const ro = new ResizeObserver(() => draw());
  ro.observe(canvas);

  /* ---------------------------------------------------------------- 流程 */
  function next() {
    const p = pos();
    if (p + 1 >= queue.length) {
      toast("这一组练完了");
      return;
    }
    render(queue[p + 1]);
  }

  function prev() {
    const p = pos();
    if (p > 0) render(queue[p - 1]);
  }

  function markPass() {
    passCue(id, current, 1);
    btnPass.textContent = "已完成，下一句";
    btnPass.classList.add("done");
    renderDots();
    setTimeout(next, 180);
  }

  /* ---------------------------------------------------------------- 事件 */
  btnOrig.addEventListener("click", () => {
    if (phase === "echo") {
      clearInterval(echoTimer);
      startRecording();
      return;
    }
    playOriginal();
  });

  btnRec.addEventListener("click", () => {
    if (recActive) {
      stopRecording();
      return;
    }
    if (phase === "echo") clearInterval(echoTimer);
    if (mode === "sync") {
      playSegment(cues[current].s, cues[current].e).then(() => stopRecording());
      startRecording();
    } else {
      startRecording();
    }
  });

  btnMine.addEventListener("click", playMine);
  root.querySelector('[data-play="orig"]').addEventListener("click", playOrigOnly);
  cmpMine.addEventListener("click", playMine);
  cmpBoth.addEventListener("click", playBoth);

  btnAgain.addEventListener("click", () => {
    clearRecording();
    draw();
    playOriginal();
  });

  btnPass.addEventListener("click", markPass);

  btnStar.addEventListener("click", () => {
    const c = cues[current];
    const on = toggleStar(id, current, c.en, c.zh);
    btnStar.classList.toggle("on", on);
    btnStar.innerHTML = icon(on ? "starOn" : "star", 15);
    renderDots();
    toast(on ? "已收藏这句" : "已取消收藏");
  });

  btnRange.addEventListener("click", () => {
    const kinds = [
      ["all", "全部句"],
      ["todo", "未完成"],
      ["star", "已收藏"],
    ];
    const idx = kinds.findIndex(([k]) => k === queueKind);
    queueKind = kinds[(idx + 1) % kinds.length][0];
    const found = kinds.find(([k]) => k === queueKind);
    queue = buildQueue(queueKind);
    btnRange.textContent = found[1];
    if (!queue.length) {
      toast(queueKind === "star" ? "还没有收藏的句子" : "这一组都完成了");
      queueKind = "all";
      queue = buildQueue("all");
      btnRange.textContent = "全部句";
    }
    const keep = queue.includes(current) ? current : queue[0];
    render(keep);
  });

  btnMode.addEventListener("click", () => {
    mode = mode === "echo" ? "sync" : "echo";
    btnMode.textContent = mode === "echo" ? "先听后读" : "同步跟读";
    state.settings.shadowMode = mode;
    toast(mode === "echo" ? "先听后读：先听，停顿，再开口" : "同步跟读：与原声同时开口（戴耳机）");
  });

  dotsEl.addEventListener("click", (e) => {
    const d = e.target.closest("[data-jump]");
    if (d) render(Number(d.dataset.jump));
  });

  root.querySelector('[data-nav="prev"]').addEventListener("click", prev);
  root.querySelector('[data-nav="next"]').addEventListener("click", next);

  elEn.addEventListener("click", (e) => {
    const tok = e.target.closest(".tok");
    if (tok) onWordClick?.(tok.dataset.w, cues[current], tok);
  });

  /* ---------------------------------------------------------------- 键盘 */
  function onKey(e) {
    if (!active || isModalOpen() || e.defaultPrevented || e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const keys = getKeys();
    if (matchKey(e, keys.prev)) { e.preventDefault(); if (!e.repeat) prev(); return; }
    if (matchKey(e, keys.next)) { e.preventDefault(); if (!e.repeat) next(); return; }
    if (matchKey(e, keys.repeat)) { e.preventDefault(); if (!e.repeat && !recActive) playOrigOnly(); return; }
    switch (e.key) {
      case " ":
        e.preventDefault();
        if (recActive) stopRecording();
        else if (phase === "review") playMine();
        else if (phase === "echo") { clearInterval(echoTimer); startRecording(); }
        else playOriginal();
        break;
      case "1": e.preventDefault(); playOrigOnly(); break;
      case "2": e.preventDefault(); if (recAudio) playMine(); break;
      case "3": e.preventDefault(); if (recAudio) playBoth(); break;
      case "Enter": e.preventDefault(); markPass(); break;
      case "r": case "R": e.preventDefault(); btnAgain.click(); break;
      default:
    }
  }
  document.addEventListener("keydown", onKey);

  practiceTimer = setInterval(() => {
    practiceSeconds += 1;
    if (practiceSeconds % 10 === 0) {
      addPracticeTime(10);
      addLessonTime(id, 10);
    }
  }, 1000);

  render(current);

  /* ---------------------------------------------------------------- 退出 */
  return {
    get cue() { return current; },
    goto(i) { if (cues[i]) render(i); },
    setActive(v) { active = v; },
    destroy() {
      active = false;
      document.removeEventListener("keydown", onKey);
      clearInterval(practiceTimer);
      clearInterval(echoTimer);
      clearTimeout(recAutoStop);
      cancelAnimationFrame(recTimer);
      cancelAnimationFrame(playRaf);
      cancelAnimationFrame(capRaf);
      ro.disconnect();
      if (practiceSeconds % 10) addPracticeTime(practiceSeconds % 10);
      abortRecording();
      clearRecAudio();
      mediaStream?.getTracks().forEach((t) => t.stop());
      video.pause();
      audioCtx?.close?.().catch(() => {});
      container.innerHTML = "";
    },
  };
}
