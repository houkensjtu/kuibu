#!/usr/bin/env bash
# 机械切分 Gatsby epub 成每章一个 JSON（不调 LLM）。
set -euo pipefail
cd "$(dirname "$0")/.."

.venv/Scripts/python.exe -m scripts.split_gatsby
