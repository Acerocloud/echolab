#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
EchoLab 课程构建管线
====================
从 YouTube 抓取「带人工字幕」的素材 -> 剪辑 -> 转码 -> 双语字幕对齐 -> lesson.json

依赖: yt-dlp（只抓字幕与时长，视频走 YouTube 嵌入，不下载）
用法:
    python tools/build_lessons.py            # 构建全部课程
    python tools/build_lessons.py grit       # 只构建某一课
"""
import json
import os
import re
import subprocess
import urllib.request
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content")
CACHE = os.path.join(ROOT, ".cache")

# ---------------------------------------------------------------- 课程定义
# clip: (start, end) 秒；None 表示全片
LESSONS = [
    {
        "id": "grit",
        "yt": "H14bBuluwB8",
        "title": "Grit: The Power of Passion and Perseverance",
        "titleZh": "坚毅：比天赋更重要的力量",
        "speaker": "Angela Lee Duckworth",
        "category": "speech",
        "level": "B2",
        "clip": (12.4, 372.93),
        "zh": True,
        "desc": "宾大心理学家用西点军校、全国拼字大赛的真实数据，讲清楚「坚毅」为什么比天赋更能预测一个人能走多远。",
        "tags": ["TED", "心理学", "成长"],
    },
    {
        "id": "conversation",
        "yt": "R1vskiVDwl4",
        "title": "10 Ways to Have a Better Conversation",
        "titleZh": "让对话变好的 10 个方法",
        "speaker": "Celeste Headlee",
        "category": "speech",
        "level": "B2",
        "clip": (12.0, 241.0),
        "zh": True,
        "desc": "电台主持人出身的主讲人给出 10 条对话原则：别 multitask、别好为人师、别把自己的经历当成对方的故事。",
        "tags": ["TED", "沟通", "口语"],
    },
    {
        "id": "bilingual",
        "yt": "MMmOLN5zBLY",
        "title": "The Benefits of a Bilingual Brain",
        "titleZh": "双语大脑的好处",
        "speaker": "Mia Nacamulli · TED-Ed",
        "category": "subject",
        "level": "B1",
        "clip": None,
        "zh": True,
        "desc": "神经科学入门：双语者的三种类型、大脑灰质密度的变化，以及「同时学两门语言会不会混淆」的答案。",
        "tags": ["TED-Ed", "语言学", "脑科学"],
    },
    {
        "id": "stock",
        "yt": "p7HKvqRI_Bo",
        "title": "How Does the Stock Market Work?",
        "titleZh": "股票市场是怎么运作的？",
        "speaker": "Oliver Elfenbaum · TED-Ed",
        "category": "subject",
        "level": "B1",
        "clip": None,
        "zh": True,
        "desc": "用一家卖柠檬水的公司讲清股票、交易所、IPO 与股价波动：经济学第一课的极简版本。",
        "tags": ["TED-Ed", "经济学", "商科"],
    },
    {
        "id": "body-language",
        "yt": "Ks-_Mh1QhMc",
        "title": "Your Body Language May Shape Who You Are",
        "titleZh": "肢体语言如何塑造你自己",
        "speaker": "Amy Cuddy",
        "category": "speech",
        "level": "C1",
        "clip": (0.0, 402.0),
        "zh": True,
        "desc": "社会心理学家 Amy Cuddy 讲「姿势反馈」：两分钟的高能量姿势如何改变睾酮与皮质醇，让你在压力场合真的更自信。语速偏快、情绪饱满，适合练语调。",
        "tags": ["TED", "肢体语言", "职场"],
    },]

SRT_TIME = re.compile(
    r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)"
)
TAG = re.compile(r"<[^>]+>")
SOUND_ONLY = re.compile(r"^[\(\[（【].*[\)\]）】]$")
CREDIT = re.compile(
    r"^(transcriber|reviewer|subtitles?|translation|proofread|翻译|校对|字幕|校對)",
    re.I,
)


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- 工具


def run(cmd, **kw):
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)
    if p.returncode != 0:
        raise RuntimeError(f"cmd failed: {' '.join(cmd[:4])}...\n{p.stderr[-1500:]}")
    return p


def clean(text):
    text = text.replace("\xa0", " ").replace("\u200b", "")
    text = TAG.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_srt(path):
    raw = open(path, encoding="utf-8-sig", errors="replace").read()
    cues = []
    for block in re.split(r"\r?\n\r?\n", raw.strip()):
        lines = [l for l in block.splitlines() if l.strip()]
        if len(lines) < 2:
            continue
        idx = next((i for i, l in enumerate(lines) if "-->" in l), None)
        if idx is None:
            continue
        m = SRT_TIME.search(lines[idx])
        if not m:
            continue
        g = [int(x) for x in m.groups()]
        s = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000.0
        e = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000.0
        t = clean(" ".join(lines[idx + 1:]))
        if t:
            cues.append([s, e, t])
    return cues


def fetch(lesson):
    """只下载字幕（视频直接走 YouTube 嵌入，不落地）"""
    folder = os.path.join(CACHE, lesson["id"])
    os.makedirs(folder, exist_ok=True)
    base = os.path.join(folder, lesson["id"])

    if not os.path.exists(base + ".en.srt"):
        langs = "en,zh-CN" if lesson.get("zh") else "en"
        run([
            sys.executable, "-m", "yt_dlp", "--skip-download", "--write-subs",
            "--sub-langs", langs, "--sub-format", "srt/best",
            "-o", base + ".%(ext)s",
            f"https://www.youtube.com/watch?v={lesson['yt']}",
        ])
    return base


def probe_duration(lesson):
    """时长从元数据拿，不下载视频"""
    try:
        p = subprocess.run(
            [sys.executable, "-m", "yt_dlp", "--skip-download",
             "--print", "%(duration)s", "--no-warnings",
             f"https://www.youtube.com/watch?v={lesson['yt']}"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        if p.returncode == 0:
            val = p.stdout.strip().splitlines()[-1].strip()
            if val.replace(".", "", 1).isdigit():
                return float(val)
    except Exception as exc:  # noqa: BLE001
        log(f"  duration lookup failed: {exc}")
    return 0.0


def make_poster(lesson, outdir, at):
    """封面：用 YouTube 官方缩略图，不下视频"""
    os.makedirs(outdir, exist_ok=True)
    poster = os.path.join(outdir, "poster.jpg")
    if os.path.exists(poster):
        return poster
    for name in ("maxresdefault", "sddefault", "hqdefault"):
        url = f"https://i.ytimg.com/vi/{lesson['yt']}/{name}.jpg"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=20) as r:
                data = r.read()
            if len(data) > 5000:
                with open(poster, "wb") as f:
                    f.write(data)
                return poster
        except Exception:
            continue
    log("  ! poster download failed")
    return poster

    return video


def merge_sentences(cues, max_dur=13.0, max_words=46):
    """把字幕行合并成适合跟读的完整句子"""
    out = []
    cur = None
    for s, e, t in cues:
        if SOUND_ONLY.match(t):
            continue
        if CREDIT.match(t):
            continue
        if cur is None:
            cur = {"s": s, "e": e, "texts": [t]}
            continue
        joined = " ".join(cur["texts"])
        dur = e - cur["s"]
        words = len(joined.split()) + len(t.split())
        ends_ok = re.search(r"[.?!…][\"'”’)\]]?$", joined) is not None
        if (not ends_ok) and dur <= max_dur and words <= max_words:
            cur["texts"].append(t)
            cur["e"] = e
        else:
            out.append(cur)
            cur = {"s": s, "e": e, "texts": [t]}
    if cur:
        out.append(cur)
    return [(c["s"], c["e"], " ".join(c["texts"]).strip()) for c in out]


def align_zh(en_items, zh_cues):
    """按时间重叠把中文行挂到英文句子上"""
    if not zh_cues:
        return ["" for _ in en_items]
    res = []
    for s, e, _ in en_items:
        picked = []
        for zs, ze, zt in zh_cues:
            mid = (zs + ze) / 2
            if s - 0.35 <= mid <= e + 0.35:
                picked.append((zs, zt))
        picked.sort()
        seen, parts = set(), []
        for _, zt in picked:
            if zt in seen:
                continue
            seen.add(zt)
            parts.append(zt)
        res.append("".join(parts))
    return res


def build(lesson):
    log(f"\n=== {lesson['id']} ===")
    base = fetch(lesson)
    total = probe_duration(lesson)
    clip = lesson["clip"] or (0.0, total)
    clip = (max(0.0, clip[0]), min(total, clip[1]) if total else clip[1])
    offset = clip[0]
    duration = round(clip[1] - clip[0], 2)

    outdir = os.path.join(CONTENT, lesson["id"])
    make_poster(lesson, outdir, 0)

    en = parse_srt(base + ".en.srt")
    en = [[max(0.0, s - offset), min(duration, e - offset), t] for s, e, t in en]
    en = [c for c in en if c[1] - c[0] > 0.25 and c[0] < duration]
    zh = []
    zh_path = base + ".zh-CN.srt"
    if lesson.get("zh") and os.path.exists(zh_path):
        zh = parse_srt(zh_path)
        zh = [[max(0.0, s - offset), min(duration, e - offset), t] for s, e, t in zh]
        zh = [c for c in zh if c[1] - c[0] > 0.2 and c[0] < duration]

    sentences = merge_sentences(en)
    zh_texts = align_zh(sentences, zh)
    cues = []
    for i, ((s, e, t), zt) in enumerate(zip(sentences, zh_texts)):
        cues.append({
            "i": i,
            "s": round(s, 2),
            "e": round(e, 2),
            "en": t,
            "zh": zt,
        })

    data = {
        "id": lesson["id"],
        "title": lesson["title"],
        "titleZh": lesson["titleZh"],
        "speaker": lesson["speaker"],
        "category": lesson["category"],
        "level": lesson["level"],
        "duration": duration,
        "desc": lesson["desc"],
        "tags": lesson["tags"],
        "source": {
            "platform": "YouTube",
            "name": lesson["speaker"].split(" · ")[-1] if " · " in lesson["speaker"] else "TED",
            "url": f"https://www.youtube.com/watch?v={lesson['yt']}",
            "yt": lesson["yt"],
            "embed": f"https://www.youtube.com/embed/{lesson['yt']}",
            "license": "CC BY-NC-ND 4.0（仅用于个人学习）",
            "clipped": lesson["clip"] is not None,
            "clipStart": round(offset, 2),
        },
        "media": {"poster": "poster.jpg"},
        "langs": ["en", "zh"] if any(c["zh"] for c in cues) else ["en"],
        "cues": cues,
    }
    with open(os.path.join(outdir, "lesson.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    log(f"  cues={len(cues)} duration={duration}s  zh={sum(1 for c in cues if c['zh'])}  yt={lesson['yt']}")
    return data


def main():
    wanted = sys.argv[1:]
    os.makedirs(CONTENT, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    built = []
    for lesson in LESSONS:
        if wanted and lesson["id"] not in wanted:
            continue
        try:
            built.append(build(lesson))
        except Exception as exc:  # noqa: BLE001
            log(f"  !! {lesson['id']} failed: {exc}")

    manifest_path = os.path.join(CONTENT, "manifest.json")
    existing = {}
    if os.path.exists(manifest_path):
        try:
            for item in json.load(open(manifest_path, encoding="utf-8"))["lessons"]:
                existing[item["id"]] = item
        except Exception:
            pass
    for d in built:
        existing[d["id"]] = {
            "id": d["id"],
            "title": d["title"],
            "titleZh": d["titleZh"],
            "speaker": d["speaker"],
            "category": d["category"],
            "level": d["level"],
            "duration": d["duration"],
            "desc": d["desc"],
            "tags": d["tags"],
            "poster": f"content/{d['id']}/{d['media']['poster']}",
            "yt": d["source"]["yt"],
            "langs": d["langs"],
            "cueCount": len(d["cues"]),
        }
    order = [l["id"] for l in LESSONS] + [k for k in existing if k not in [l["id"] for l in LESSONS]]
    payload = {
        "version": 1,
        "generated": True,
        "lessons": [existing[k] for k in order if k in existing],
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    log(f"\nmanifest -> {manifest_path} ({len(payload['lessons'])} lessons)")


if __name__ == "__main__":
    main()
