#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
从 ECDICT 里抽取本课程库用到的单词，生成 content/dict.json
（离线可用：音标 + 中文释义 + 词性）

用法: python tools/build_dict.py
数据源: https://github.com/skywind3000/ECDICT (MIT)
"""
import csv
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content")
CACHE = os.path.join(ROOT, ".cache", "ecdict.csv")
URL = "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv"

WORD_RE = re.compile(r"[A-Za-z][A-Za-z'’\-]*")


def ensure_source():
    if os.path.exists(CACHE) and os.path.getsize(CACHE) > 10_000_000:
        return
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    print("downloading ecdict.csv (66MB) ...", flush=True)
    urllib.request.urlretrieve(URL, CACHE)
    print("done", os.path.getsize(CACHE))


def load_lessons():
    words = set()
    for name in os.listdir(CONTENT):
        path = os.path.join(CONTENT, name, "lesson.json")
        if not os.path.exists(path):
            continue
        data = json.load(open(path, encoding="utf-8"))
        for cue in data["cues"]:
            for w in WORD_RE.findall(cue["en"]):
                words.add(w.lower())
    return words


POS_MAP = {"a.": "adj.", "ad.": "adv.", "art.": "art.", "aux.": "aux."}


def parse_translation(raw):
    """'adj. 苛求的, 费力的\\nn. 要求' -> [{pos, zh}]"""
    out = []
    for line in [l.strip() for l in raw.replace("\\n", "\n").split("\n") if l.strip()]:
        m = re.match(r"^([a-z]+\.(?:\s*&\s*[a-z]+\.)*)\s*(.+)$", line)
        if m:
            pos = m.group(1).replace(" ", "")
            pos = POS_MAP.get(pos, pos)
            zh = m.group(2).strip()
        else:
            pos, zh = "", line
        zh = re.sub(r"\s+", " ", zh).replace("[网络]", "").strip(" ,;")
        if zh:
            out.append({"pos": pos, "zh": zh})
    return out[:4]


def main():
    ensure_source()
    wanted = load_lessons()
    print(f"words in lessons: {len(wanted)}")

    found = {}
    lemmas = {}
    with open(CACHE, encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            w = (row.get("word") or "").strip().lower()
            if not w:
                continue
            if w in wanted and w not in found:
                tr = parse_translation(row.get("translation") or "")
                if not tr:
                    continue
                found[w] = {
                    "ph": (row.get("phonetic") or "").strip(),
                    "defs": tr,
                    "rank": int(row["frq"]) if (row.get("frq") or "").isdigit() else 0,
                }
            # 记录屈折关系，供回退查词使用
            ex = row.get("exchange") or ""
            for part in ex.split("/"):
                if part.startswith("0:") or part.startswith("1:"):
                    form = part[2:].strip().lower()
                    if form and form in wanted and form not in lemmas:
                        lemmas[form] = w

    # 词形回退：calculated -> calculate
    for form, base in lemmas.items():
        if form in found or base not in found:
            continue
        found[form] = dict(found[base], lemma=base)

    out_path = os.path.join(CONTENT, "dict.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(found, f, ensure_ascii=False, separators=(",", ":"))

    missing = sorted(w for w in wanted if w not in found)
    print(f"entries: {len(found)}  missing: {len(missing)}  -> {out_path}")
    if missing:
        print("  " + ", ".join(missing[:60]))


if __name__ == "__main__":
    main()
