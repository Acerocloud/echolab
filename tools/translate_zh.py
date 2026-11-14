#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
给某节课补齐中文译文（机翻，走本地 /api/ai 中转）

用法:
    set ECHOLAB_AI_KEY=oc_sk_xxx
    python tools/translate_zh.py muse-launch [--batch 25] [--model deepseek-v4.1-flash]

特点:
  - 分批调用，单批失败自动重试
  - 断点续跑：已翻好的存 .cache/zh/<id>.partial.json，重复运行只补缺的
  - 最后合并进 content/<id>/lesson.json
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content")
CACHE = os.path.join(ROOT, ".cache", "zh")

PROXY = "http://127.0.0.1:8777/api/ai"
API_BASE = "https://opencode.ai/zen/go/v1"

SYSTEM = (
    "你是一位专业的英中字幕译者，正在为英语学习应用翻译逐句字幕。"
    "译文要自然、口语化，符合中文说话习惯，不要逐字硬译，也不要加注解。"
    "原文里的 um / uh / like / you know 等语气词可以省略或自然融入，不必逐个对应。"
    "只输出 JSON，不要输出任何其他文字。"
)


def call(key, model, messages, max_tokens):
    payload = {
        "url": f"{API_BASE}/chat/completions",
        "key": key,
        "model": model,
        "headers": {"x-opencode-session": f"echolab-zh-{os.getpid()}"},
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": max_tokens,
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(PROXY, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        body = json.loads(r.read().decode("utf-8"))
    choice = (body.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    content = msg.get("content") or ""
    if not content:
        raise RuntimeError(f"空响应 finish={choice.get('finish_reason')}")
    return content


def parse_pairs(text, start, count):
    """从模型输出里抠出 [{i, zh}]，容忍 markdown 围栏和多余文字"""
    s = str(text).strip()
    a, b = s.find("["), s.rfind("]")
    if a < 0 or b <= a:
        raise ValueError("没有 JSON 数组")
    arr = json.loads(s[a:b + 1])
    got = {}
    for item in arr:
        if not isinstance(item, dict):
            continue
        try:
            i = int(item.get("i"))
        except (TypeError, ValueError):
            continue
        zh = str(item.get("zh") or "").strip()
        if zh:
            got[i] = zh
    need = range(start, start + count)
    missing = [i for i in need if i not in got]
    if missing:
        raise ValueError(f"缺 {len(missing)} 条: {missing[:5]}")
    return got


def main():
    if len(sys.argv) < 2:
        sys.exit("用法: translate_zh.py <lesson-id> [--batch N] [--model M]")
    lesson_id = sys.argv[1]
    batch = 25
    model = "deepseek-v4.1-flash"
    for i, a in enumerate(sys.argv):
        if a == "--batch" and i + 1 < len(sys.argv):
            batch = int(sys.argv[i + 1])
        if a == "--model" and i + 1 < len(sys.argv):
            model = sys.argv[i + 1]

    key = os.environ.get("ECHOLAB_AI_KEY", "").strip()
    if not key:
        sys.exit("缺少 ECHOLAB_AI_KEY 环境变量")

    path = os.path.join(CONTENT, lesson_id, "lesson.json")
    if not os.path.exists(path):
        sys.exit(f"找不到 {path}")
    data = json.load(open(path, encoding="utf-8"))
    cues = data["cues"]

    os.makedirs(CACHE, exist_ok=True)
    part_path = os.path.join(CACHE, f"{lesson_id}.partial.json")
    done = {}
    if os.path.exists(part_path):
        try:
            done = {int(k): v for k, v in json.load(open(part_path, encoding="utf-8")).items()}
        except Exception:
            done = {}

    todo = [c for c in cues if c["i"] not in done]
    print(f"{lesson_id}: 共 {len(cues)} 句，已完成 {len(done)}，待翻 {len(todo)}", flush=True)

    t0 = time.time()
    for pos in range(0, len(todo), batch):
        chunk = todo[pos:pos + batch]
        start = chunk[0]["i"]
        lines = "\n".join(f'{c["i"]}\t{c["en"]}' for c in chunk)
        user = (
            f"把下面 {len(chunk)} 句英文逐句翻译成简体中文。\n"
            f"只输出 JSON 数组，每项形如 {{\"i\": 序号, \"zh\": \"中文译文\"}}，序号必须与给定的一致。\n\n"
            f"{lines}"
        )
        for attempt in range(4):
            try:
                out = call(key, model, [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": user},
                ], max_tokens=min(4000, 300 + len(chunk) * 130))
                got = parse_pairs(out, start, len(chunk))
                done.update(got)
                json.dump({str(k): v for k, v in sorted(done.items())},
                          open(part_path, "w", encoding="utf-8"), ensure_ascii=False)
                rate = (pos + len(chunk)) / max(1, time.time() - t0)
                left = (len(todo) - pos - len(chunk)) / max(0.01, rate)
                print(f"  {min(pos+len(chunk), len(todo))}/{len(todo)}  "
                      f"剩余约 {left/60:.1f} 分钟", flush=True)
                break
            except Exception as exc:
                wait = 2 * (attempt + 1)
                print(f"  批次 {start} 第 {attempt+1} 次失败: {str(exc)[:120]}  等 {wait}s", flush=True)
                time.sleep(wait)
        else:
            print(f"  !! 批次 {start} 放弃，稍后重跑可续", flush=True)

    for c in cues:
        c["zh"] = done.get(c["i"], c.get("zh") or "")
    data["langs"] = ["en", "zh"] if any(c["zh"] for c in cues) else ["en"]

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    filled = sum(1 for c in cues if c["zh"])
    print(f"\n完成：{filled}/{len(cues)} 句有中文 -> {path}")


if __name__ == "__main__":
    main()
