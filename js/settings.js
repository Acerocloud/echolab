/* EchoLab — 设置 */

import { state, setSetting, resetAll, exportJSON } from "./store.js";
import { icon, esc, toast, openModal } from "./ui.js";
import { testConnection, listModels, pickModel } from "./ai.js";
import { ACTIONS, getKeys, keyLabel } from "./keys.js";

export const meta = { title: "设置" };

export async function render(root) {
  const s = state.settings;
  const ai = s.ai || {};

  root.innerHTML = `
    <div class="page-head fade-up">
      <div>
        <span class="eyebrow">${icon("gear", 14)} PREFERENCES</span>
        <h1>设置</h1>
        <p class="page-sub">所有偏好都存在这台电脑的浏览器里，不会上传。</p>
      </div>
    </div>

    <section class="block">
      <div class="block-head"><h2>跟读</h2></div>

      <div class="setting-row">
        <div><b>回音法停顿</b><span>听完原声后，留出「让声音在脑中回响」的时间</span></div>
        <button class="switch ${s.echoOn ? "on" : ""}" data-toggle="echoOn" role="switch" aria-checked="${s.echoOn}"><i></i></button>
      </div>

      <div class="setting-row">
        <div><b>停顿长度</b><span>太长会走神，太短来不及回忆</span></div>
        <div class="range-wrap">
          <input type="range" min="1" max="5" step="1" value="${Math.round((s.echoMs || 3000) / 1000)}" data-range="echoSec" />
          <span class="mono" id="echoVal">${Math.round((s.echoMs || 3000) / 1000)} 秒</span>
        </div>
      </div>

      <div class="setting-row">
        <div><b>默认跟读模式</b><span>回音法：先听后说；同步：与原声同时开口</span></div>
        <div class="seg" data-key="shadowMode">
          <button data-v="echo" class="${s.shadowMode !== "sync" ? "on" : ""}">回音法</button>
          <button data-v="sync" class="${s.shadowMode === "sync" ? "on" : ""}">同步跟读</button>
        </div>
      </div>

      <div class="setting-row">
        <div><b>自动播放</b><span>进入跟读页自动播一遍原声，接着进入回声</span></div>
        <button class="switch ${s.autoAdvance ? "on" : ""}" data-toggle="autoAdvance" role="switch" aria-checked="${s.autoAdvance}"><i></i></button>
      </div>
    </section>

    <section class="block">
      <div class="block-head"><h2>AI 造句</h2><span class="muted small">OpenAI 兼容接口</span></div>

      <div class="setting-row">
        <div><b>接口地址</b><span>到 /v1 为止，例如 https://opencode.ai/zen/go/v1</span></div>
        <input class="field" data-ai="baseUrl" type="url" spellcheck="false" placeholder="https://.../v1" value="${esc(ai.baseUrl || "")}" />
      </div>

      <div class="setting-row">
        <div><b>API Key</b><span>只存在这台电脑的浏览器里，经本地服务转发</span></div>
        <input class="field" data-ai="key" type="password" spellcheck="false" placeholder="sk-..." value="${esc(ai.key || "")}" />
      </div>

      <div class="setting-row">
        <div><b>模型</b><span>先点「刷新模型」从接口拉取，再选一个</span></div>
        <div class="ai-model">
          <select id="aiModel" class="field">
            ${ai.model ? `<option value="${esc(ai.model)}" selected>${esc(ai.model)}</option>` : `<option value="">（还没选）</option>`}
          </select>
          <button class="btn btn-sm" id="aiModels">刷新模型</button>
        </div>
      </div>

      <div class="setting-row">
        <div><b>测试连接</b><span id="aiStatus">还没测试</span></div>
        <button class="btn btn-sm" id="aiTest">测试</button>
      </div>
    </section>

    <section class="block">
      <div class="block-head"><h2>数据</h2><span class="muted small">只存在 localStorage</span></div>
      <div class="setting-row">
        <div><b>导出学习记录</b><span>下载一个 JSON，含进度、生词与收藏</span></div>
        <button class="btn btn-sm" id="btnExport">${icon("arrow", 14)} 导出</button>
      </div>
      <div class="setting-row">
        <div><b>清空所有数据</b><span>进度、生词、设置全部重置，不可撤销</span></div>
        <button class="btn btn-sm danger" id="btnReset">${icon("trash", 14)} 清空</button>
      </div>
    </section>

    <section class="block">
      <div class="block-head"><h2>快捷键</h2></div>
      <div class="keys-grid">
        <div><kbd>Space</kbd><span>播放 / 暂停（固定）</span></div>
        ${ACTIONS.map((a) => `<div><kbd>${esc(keyLabel(getKeys()[a.id]))}</kbd><span>${esc(a.label)}</span></div>`).join("")}
        <div><kbd>?</kbd><span>快捷键面板</span></div>
        <div><kbd>Esc</kbd><span>返回 / 关闭</span></div>
      </div>
      <p class="muted small" style="margin-top:12px">在课程页点控制条右侧的 ⌨ 可以改键。</p>
    </section>
  `;

  /* 分段控件 */
  root.querySelectorAll(".seg[data-key]").forEach((seg) => {
    seg.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-v]");
      if (!btn) return;
      const key = seg.dataset.key;
      let value = btn.dataset.v;
      if (key === "speed") value = Number(value);
      setSetting(key, value);
      seg.querySelectorAll("[data-v]").forEach((b) => b.classList.toggle("on", b === btn));
      if (key === "shadowMode") toast(value === "echo" ? "默认用回音法" : "默认同步跟读");
    });
  });

  /* 开关 */
  root.querySelectorAll("[data-toggle]").forEach((sw) => {
    sw.addEventListener("click", () => {
      const key = sw.dataset.toggle;
      const next = !state.settings[key];
      setSetting(key, next);
      sw.classList.toggle("on", next);
      sw.setAttribute("aria-checked", String(next));
    });
  });

  /* 滑杆 */
  root.querySelectorAll("[data-range]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.range;
      if (key === "fontScale") {
        const v = Number(input.value) / 100;
        setSetting("fontScale", v);
        root.querySelector("#fontVal").textContent = `${input.value}%`;
      } else if (key === "echoSec") {
        const v = Number(input.value) * 1000;
        setSetting("echoMs", v);
        root.querySelector("#echoVal").textContent = `${input.value} 秒`;
      }
    });
  });

  root.querySelector("#btnExport").addEventListener("click", () => {
    const blob = new Blob([exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `echolab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("已导出");
  });

  root.querySelector("#btnReset").addEventListener("click", () => {
    openModal({
      title: "清空所有数据？",
      body: `<p>进度、生词、收藏与设置都会被删除，无法恢复。</p>`,
      actions: [
        { label: "取消" },
        { label: "确认清空", primary: true, onClick: () => resetAll() },
      ],
    });
  });

  root.querySelectorAll("[data-ai]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const next = { ...(state.settings.ai || {}) };
      next[inp.dataset.ai] = inp.value.trim();
      setSetting("ai", next);
      const status = root.querySelector("#aiStatus");
      if (status) status.textContent = "已保存，可以点「测试」";
    });
  });

  function saveModel(model) {
    const next = { ...(state.settings.ai || {}) };
    next.model = model;
    setSetting("ai", next);
  }

  function fillModels(models, current) {
    const sel = root.querySelector("#aiModel");
    if (!models.length) {
      sel.innerHTML = `<option value="">（没取到模型）</option>`;
      return;
    }
    sel.innerHTML = models
      .map((m) => `<option value="${esc(m)}"${m === current ? " selected" : ""}>${esc(m)}</option>`)
      .join("");
  }

  root.querySelector("#aiModel").addEventListener("change", (e) => {
    saveModel(e.target.value);
    root.querySelector("#aiStatus").textContent = `已选 ${e.target.value}，可以点「测试」`;
  });

  root.querySelector("#aiModels").addEventListener("click", async () => {
    const status = root.querySelector("#aiStatus");
    status.textContent = "拉取模型中…";
    try {
      const models = await listModels();
      const cur = state.settings.ai?.model || "";
      const picked = pickModel(models, cur);
      fillModels(models, picked);
      if (picked && picked !== cur) saveModel(picked);
      status.textContent = `拉到 ${models.length} 个模型${picked ? `，已选 ${picked}` : ""}`;
    } catch (e) {
      status.textContent = `失败：${e.message}`;
    }
  });

  root.querySelector("#aiTest").addEventListener("click", async () => {
    const status = root.querySelector("#aiStatus");
    status.textContent = "测试中…";
    try {
      const models = await listModels();
      if (!models.length) throw new Error("接口没有返回任何模型");
      const cur = state.settings.ai?.model || "";
      const first = pickModel(models, cur);
      const order = [
        first,
        ...models.filter((m) => m !== first && !/free|contributor|beam/i.test(m)),
      ].slice(0, 3);

      const failures = [];
      for (const m of order) {
        saveModel(m);
        fillModels(models, m);
        status.textContent = `试 ${m}…`;
        try {
          const reply = await testConnection();
          status.textContent = `连接成功 · ${m} · 回复「${reply || "OK"}」`;
          return;
        } catch (e) {
          failures.push(`${m}：${e.message}`);
          // 只有「模型不可用 / 地区限制」才换下一个，密钥错就直接停
          if (![403, 404].includes(e.status)) break;
        }
      }
      status.textContent = `失败：${failures[failures.length - 1] || "没有可用模型"}`;
    } catch (e) {
      status.textContent = `失败：${e.message}`;
    }
  });

  return () => {};
}
