#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
迁移：从「本地 mp4」改为「YouTube 嵌入」
- lesson.json 增加 source.yt / source.embed
- 删除本地 video.mp4，保留 poster.jpg
- manifest 增加 yt

用法: python tools/migrate_to_youtube.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CONTENT = os.path.join(ROOT, "content")
sys.path.insert(0, HERE)

from build_lessons import LESSONS  # noqa: E402


def main():
    by_id = {l["id"]: l for l in LESSONS}
    manifest_path = os.path.join(CONTENT, "manifest.json")
    manifest = json.load(open(manifest_path, encoding="utf-8"))

    total = 0
    for item in manifest["lessons"]:
        lid = item["id"]
        cfg = by_id.get(lid)
        path = os.path.join(CONTENT, lid, "lesson.json")
        if not cfg or not os.path.exists(path):
            print("skip", lid)
            continue

        data = json.load(open(path, encoding="utf-8"))
        yt = cfg["yt"]
        data["source"]["yt"] = yt
        data["source"]["embed"] = f"https://www.youtube.com/embed/{yt}"
        data["media"] = {"poster": data.get("media", {}).get("poster", "poster.jpg")}
        # 兼容：clipStart 不在时按 0
        data["source"].setdefault("clipStart", 0)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)

        item["yt"] = yt

        video = os.path.join(CONTENT, lid, "video.mp4")
        if os.path.exists(video):
            size = os.path.getsize(video)
            os.remove(video)
            total += size
            print(f"{lid:18} removed video {size/1024/1024:.1f} MB  yt={yt}")

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

    print(f"\n freed {total/1024/1024:.1f} MB")


if __name__ == "__main__":
    main()
