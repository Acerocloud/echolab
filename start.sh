#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
PORT=8777

if command -v python3 >/dev/null 2>&1; then PY=python3
elif command -v python >/dev/null 2>&1; then PY=python
else
  echo "[EchoLab] 没有找到 Python，请先安装 Python 3。"
  exit 1
fi

echo "[EchoLab] http://127.0.0.1:$PORT"
( sleep 1
  if command -v open >/dev/null 2>&1; then open "http://127.0.0.1:$PORT/"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://127.0.0.1:$PORT/"
  fi ) &
exec "$PY" -m http.server "$PORT" --bind 127.0.0.1
