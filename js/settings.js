/* EchoLab — 设置 */

import { state, setSetting, resetAll, exportJSON } from "./store.js";
import { icon, esc, toast, openModal } from "./ui.js";
import { testConnection, listModels, pickModel } from "./ai.js";
import { ACTIONS, getKeys, keyLabel } from "./keys.js";
import { checkForUpdate, installUpdate } from "./update.js";
import { DEFAULT_WORD_PROMPT } from "./word-explanations.js";
import { mountDriveSettings } from "./drive-settings.js";

export const meta = { title: "设置" };

export async function render(root) {
  const s = state.settings;
  const ai = s.ai || {};

  root.innerHTML = `
    <div class="page-head fade-up">
      <div>
        <h1>设置</h1>
        <p class="page-sub">管理跟读、AI 造句和本机学习数据。</p>
      </div>
    </div>

    <section class="block">
      <div class="block-head"><h2>软件更新</h2></div>
      <div class="setting-row">
        <div><span id="updateStatus" role="status">正在检查更新…</span></div>
        <div class="update-actions">
          <button class="btn btn-plain" id="updateCheck">检查更新</button>
          <button class="btn btn-primary" id="updateInstall" hidden>一键更新</button>
        </div>
      </div>
    </section>

    <section class="block">
      <div class="block-head"><h2>跟读</h2></div>

      <div class="setting-row">
        <div><b>开口前停顿</b><span>先听后读时，播放完毕后留出准备时间</span></div>
        <button class="switch ${s.echoOn ? "on" : ""}" data-toggle="echoOn" aria-label="开口前停顿" role="switch" aria-checked="${s.echoOn}"><i></i></button>
      </div>

      <div class="setting-row">
        <div><b>停顿长度</b></div>
        <div class="range-wrap">
          <input type="range" min="1" max="5" step="1" value="${Math.round((s.echoMs || 3000) / 1000)}" data-range="echoSec" aria-label="停顿长度" />
          <span class="mono" id="echoVal">${Math.round((s.echoMs || 3000) / 1000)} 秒</span>
        </div>
      </div>

      <div class="setting-row">
        <div><b>默认跟读模式</b><span>选择先听原声再读，或与原声同时开口</span></div>
        <div class="seg" data-key="shadowMode">
          <button data-v="echo" class="${s.shadowMode !== "sync" ? "on" : ""}">先听后读</button>
          <button data-v="sync" class="${s.shadowMode === "sync" ? "on" : ""}">同步跟读</button>
        </div>
      </div>

      <div class="setting-row">
        <div><b>自动播放</b><span>打开跟读时自动播放当前句</span></div>
        <button class="switch ${s.autoAdvance ? "on" : ""}" data-toggle="autoAdvance" aria-label="自动播放" role="switch" aria-checked="${s.autoAdvance}"><i></i></button>
      </div>
    </section>

    <section class="block">
      <div class="block-head"><h2>AI 造句</h2><span class="muted small">OpenAI 兼容接口</span></div>
      <div class="setting-row setting-prompt">
        <div><b>单词解释提示词</b><span>生成词卡的本句解释时使用</span></div>
        <textarea class="field" id="wordPrompt" rows="5" aria-label="单词解释提示词">${esc(state.settings.wordPrompt || DEFAULT_WORD_PROMPT)}</textarea>
        <button class="btn btn-plain btn-sm" id="resetWordPrompt">恢复默认</button>
      </div>

      <div class="setting-row">
        <div><b>接口地址</b><span>到 /v1 为止，例如 https://opencode.ai/zen/go/v1</span></div>
        <input class="field" data-ai="baseUrl" aria-label="接口地址" type="url" spellcheck="false" placeholder="https://.../v1" value="${esc(ai.baseUrl || "")}" />
      </div>

      <div class="setting-row">
        <div><b>API Key</b><span>只存在这台电脑的浏览器里，经本地服务转发</span></div>
        <input class="field" data-ai="key" aria-label="API Key" type="password" spellcheck="false" placeholder="sk-..." value="${esc(ai.key || "")}" />
      </div>

      <div class="setting-row">
        <div><b>模型</b><span>先点「刷新模型」从接口拉取，再选一个</span></div>
        <div class="ai-model">
          <select id="aiModel" aria-label="模型" class="field">
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
      <div class="block-head"><h2>Google Drive</h2></div>
      <div class="setting-row">
        <div><b>云端学习记录</b><span id="driveStatus" role="status">正在检查连接…</span></div>
        <div class="update-actions"><button class="btn btn-primary" id="driveConnect">使用 Google 登录</button><button class="btn btn-primary" id="driveSync" hidden>立即同步</button><button class="btn btn-plain" id="driveDisconnect" hidden>断开连接</button><button class="btn btn-plain" id="driveRecover" hidden>找回恢复前记录</button></div>
      </div>
      <p class="muted small">登录后自动同步学习进度、生词、收藏和单词解释；AI 密钥保留在本机。登录到期或重新打开页面后需要重新登录。</p>
      <p class="muted small">同步位置：Google Drive 的 EchoLab 隐藏应用数据区。</p>
    </section>

    <section class="block">
      <div class="block-head"><h2>学习数据</h2></div>
      <div class="setting-row">
        <div><b>导出学习记录</b><span>下载进度、生词与收藏（JSON）</span></div>
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

  const cleanupDrive = mountDriveSettings(root);

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

  const wordPrompt = root.querySelector("#wordPrompt");
  wordPrompt.addEventListener("change", () => {
    setSetting("wordPrompt", wordPrompt.value.trim() || DEFAULT_WORD_PROMPT);
    wordPrompt.value = state.settings.wordPrompt;
  });
  root.querySelector("#resetWordPrompt").addEventListener("click", () => {
    wordPrompt.value = DEFAULT_WORD_PROMPT;
    setSetting("wordPrompt", DEFAULT_WORD_PROMPT);
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

  const updateStatus = root.querySelector("#updateStatus");
  const updateCheck = root.querySelector("#updateCheck");
  const updateInstall = root.querySelector("#updateInstall");
  async function showUpdate(refresh = false) {
    updateCheck.disabled = true;
    updateInstall.hidden = true;
    updateStatus.textContent = "正在检查更新…";
    try {
      const { current, latest, available, installable } = await checkForUpdate({ refresh });
      updateInstall.hidden = !(available && installable);
      updateStatus.textContent = available
        ? `当前 v${current}，可更新至 v${latest}。${installable ? "" : "请在 Git 工作副本中运行 git pull。"}`
        : `当前 v${current}，已是最新版。`;
    } catch (error) {
      updateStatus.textContent = error.message;
    } finally {
      updateCheck.disabled = false;
    }
  }
  updateCheck.addEventListener("click", () => showUpdate(true));
  updateInstall.addEventListener("click", async () => {
    updateCheck.disabled = true;
    updateInstall.disabled = true;
    updateStatus.textContent = "正在下载、验证并安装更新…";
    try {
      await installUpdate();
    } catch (error) {
      updateStatus.textContent = error.message;
      updateCheck.disabled = false;
      updateInstall.disabled = false;
    }
  });
  showUpdate();

  return () => cleanupDrive();
}
