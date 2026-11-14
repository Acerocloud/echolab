/* EchoLab — AI 造句（OpenAI 兼容接口，经本地 /api/ai 代理） */

import { state, setSetting } from "./store.js";

let sessionId = "";

export function aiSettings() {
  const s = state.settings.ai || {};
  return {
    baseUrl: String(s.baseUrl || "").trim().replace(/\/+$/, ""),
    key: String(s.key || "").trim(),
    model: String(s.model || "").trim(),
  };
}

export function hasAI() {
  const c = aiSettings();
  return Boolean(c.baseUrl && c.key);
}

async function post(body) {
  let res;
  try {
    res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error("连不上本地服务，请用 start.bat 启动（python http.server 没有 /api/ai）");
  }
  if (res.status === 404 || res.status === 405) {
    throw new Error("本地服务不支持 /api/ai，请用 start.bat 启动");
  }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* ignore */ }
  if (!res.ok) {
    const e = data?.error;
    const hasBody = !(e && typeof e === "object" && e.fromBody === false);
    let msg = "";
    if (typeof e === "string") msg = e;
    else if (e && typeof e === "object") msg = e.message || "";
    if (!msg) msg = data?.message || "";
    if (!msg || !hasBody) msg = "";
    if (!msg) {
      const map = {
        400: "请求被拒绝（400）。最常见的原因是模型名不对，点「刷新模型」选一个再试",
        401: "密钥无效或没有权限（401）",
        402: "余额不足（402）",
        403: "密钥没有这个模型的权限（403）",
        404: "接口地址不对（404），检查是否以 /v1 结尾",
        429: "请求太频繁（429），等一会儿再试",
      };
      msg = map[res.status] || (res.status >= 500 ? `上游服务错误（${res.status}）` : `请求失败（HTTP ${res.status}）`);
    } else {
      msg = `${msg}（HTTP ${res.status}）`;
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  if (!data) throw new Error("接口返回的不是 JSON");
  return data;
}

/** 拉取模型列表 */
export async function listModels() {
  const cfg = aiSettings();
  if (!cfg.baseUrl) throw new Error("还没配置接口地址");
  const data = await post({ url: `${cfg.baseUrl}/models`, key: cfg.key, method: "GET", headers: extraHeaders(cfg) });
  const arr = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return arr
    .map((m) => (typeof m === "string" ? m : m?.id || m?.name))
    .filter(Boolean)
    .sort();
}

/** 有些网关要求额外的请求头（opencode 需要 x-opencode-session 才能路由） */
function extraHeaders(cfg) {
  if (/opencode\.ai/i.test(cfg.baseUrl)) {
    if (!sessionId) {
      sessionId = (crypto.randomUUID && crypto.randomUUID()) || `echolab-${Date.now()}`;
    }
    return { "x-opencode-session": sessionId };
  }
  return {};
}

export async function chat(messages, { temperature = 1, maxTokens = 2000 } = {}) {
  const cfg = aiSettings();
  if (!cfg.baseUrl) throw new Error("还没配置 AI 接口地址");
  if (!cfg.key) throw new Error("还没填 API Key");

  const data = await post({
    url: `${cfg.baseUrl}/chat/completions`,
    key: cfg.key,
    model: cfg.model || undefined,
    messages,
    temperature,
    max_tokens: maxTokens,
    headers: extraHeaders(cfg),
  });

  const choice = data?.choices?.[0] || {};
  const msg = choice.message || {};
  const content = msg.content || "";
  if (content) return content;

  if (choice.finish_reason === "length") {
    throw new Error("输出被截断了：模型把额度花在思考上。把生成数量调小，或换一个轻量模型（名字里带 flash / haiku 的）");
  }
  if (msg.reasoning_content) {
    throw new Error("模型只返回了思考过程、没有正文。换一个轻量模型（名字里带 flash / haiku 的）再试");
  }
  throw new Error("接口没有返回内容，换一个模型试试");
}

const PREFERRED = ["deepseek-v4.1-flash", "glm-5.3-flash", "claude-haiku-5-5", "gpt-5.6-luna"];
const RISKY = /(free|contributor|beam)/i;

/** 挑一个轻量且大概率可用的模型（跳过 free / contributor 这类常被地区限制的） */
export function pickModel(models, current) {
  if (!models.length) return "";
  if (current && models.includes(current) && !RISKY.test(current)) return current;
  for (const p of PREFERRED) if (models.includes(p)) return p;
  const hit = models.find((m) => /(flash|haiku|mini)/i.test(m) && !RISKY.test(m));
  if (hit) return hit;
  const safe = models.find((m) => !RISKY.test(m));
  return safe || models[0];
}

/** 从可能带 markdown 围栏的文本里抠出 JSON 数组 */
function parseArray(text) {
  const s = String(text).trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("模型没有按 JSON 返回，换一次试试");
  const slice = s.slice(start, end + 1);
  try {
    const arr = JSON.parse(slice);
    return Array.isArray(arr) ? arr : [];
  } catch {
    // 常见修复：去掉末尾逗号
    const fixed = slice.replace(/,\s*([\]}])/g, "$1");
    try {
      const arr = JSON.parse(fixed);
      return Array.isArray(arr) ? arr : [];
    } catch {
      throw new Error("返回的 JSON 解析失败，换一次试试");
    }
  }
}

const SYSTEM = "你是一位英语老师，为中文母语的英语学习者（CEFR B1–B2）编写例句。只输出 JSON。";

export async function generateSentences(words, count, { avoid = [] } = {}) {
  const shuffled = [...words].sort(() => Math.random() - 0.5);
  const picked = [];
  for (let i = 0; i < count; i += 1) picked.push(shuffled[i % shuffled.length]);
  const wordList = [...new Set(picked)].join(", ");
  const avoidBlock = avoid.length
    ? `\n不要与下面这些已经用过的句子重复：\n${avoid.slice(-40).map((s) => `- ${s}`).join("\n")}`
    : "";

  const user = `请为下面的单词生成 ${count} 个**全新**的英文例句。

要求：
1. 每句 6–16 个词，日常场景（工作、学习、旅行、家庭、科技、健康、社交…），语境要各不相同；
2. 自然、地道，不要出现人名、地名、数字；
3. 目标词必须原样出现在句子里（可用常见变形）；
4. 每句配一句自然的中文翻译（简体）；
5. 只输出 JSON 数组，不要解释，不要 markdown 代码块。

格式：[{"word":"目标词","en":"英文句子","zh":"中文翻译"}]

单词（可重复使用，但尽量覆盖更多词）：${wordList}${avoidBlock}`;

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ];
  const opts = { temperature: 1, maxTokens: Math.min(4000, 500 + count * 130) };

  let content;
  try {
    content = await chat(messages, opts);
  } catch (e) {
    // 模型在当前地区不可用时，自动换一个可用的再试一次
    if (e.status === 403 || e.status === 404) {
      const models = await listModels();
      const alt = pickModel(models, "");
      const cur = aiSettings().model;
      if (alt && alt !== cur) {
        setSetting("ai", { ...(state.settings.ai || {}), model: alt });
        content = await chat(messages, opts);
      } else {
        throw e;
      }
    } else {
      throw e;
    }
  }

  const lower = new Set(words.map((w) => w.toLowerCase()));
  return parseArray(content)
    .map((x) => ({
      word: String(x?.word || "").toLowerCase().trim(),
      en: String(x?.en || "").trim(),
      zh: String(x?.zh || "").trim(),
    }))
    .filter((x) => x.en && x.zh && (lower.has(x.word) || words.some((w) => x.word.startsWith(w))))
    .slice(0, count);
}

export async function testConnection() {
  const content = await chat([{ role: "user", content: "只回复两个字母：OK" }], { maxTokens: 300, temperature: 0 });
  return String(content).trim().slice(0, 40);
}

