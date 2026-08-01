#!/usr/bin/env bash
# 机械切分 SICP 第一章源文件成每小节一个 JSON（不调 LLM）。
set -euo pipefail
cd "$(dirname "$0")/.."

.venv/Scripts/python.exe -m scripts.split_sicp
