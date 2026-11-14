/* EchoLab — 课程数据访问 */

const cache = new Map();

export const CATEGORIES = {
  speech: { label: "演讲", hint: "TED / 公开演讲，结构清晰、语速稳定" },
  interview: { label: "访谈", hint: "真实对谈，口语化、有停顿和语气词" },
  subject: { label: "学科介绍", hint: "TED-Ed 科普短片，术语多、逻辑强" },
  news: { label: "新闻", hint: "新闻播报，信息密度高" },
};

export const LEVELS = ["A2", "B1", "B2", "C1", "C2"];

let manifestPromise = null;

export async function getManifest() {
  if (cache.has("manifest")) return cache.get("manifest");
  if (!manifestPromise) {
    manifestPromise = fetch("content/manifest.json", { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(`manifest ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const lessons = (data.lessons || []).slice().sort((a, b) => {
          const order = { speech: 0, subject: 1, interview: 2, news: 3 };
          return (order[a.category] ?? 9) - (order[b.category] ?? 9);
        });
        cache.set("manifest", lessons);
        return lessons;
      })
      .catch((err) => {
        console.error(err);
        manifestPromise = null;
        return [];
      });
  }
  return manifestPromise;
}

export async function getLesson(id) {
  if (cache.has(id)) return cache.get(id);
  const r = await fetch(`content/${encodeURIComponent(id)}/lesson.json`, { cache: "force-cache" });
  if (!r.ok) throw new Error(`lesson ${id} ${r.status}`);
  const data = await r.json();
  cache.set(id, data);
  return data;
}

export function mediaURL(id, file) {
  return `content/${encodeURIComponent(id)}/${file}`;
}

/** 本地统计：一节课的完成度 */
export function completion(lesson, progress) {
  const total = lesson.cueCount || 0;
  const done = progress?.passed?.length || 0;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}
