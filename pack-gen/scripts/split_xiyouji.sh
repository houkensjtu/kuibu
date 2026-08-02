#!/usr/bin/env bash
# 机械切分西游记 epub 成每回一个 JSON（不调 LLM）。
set -euo pipefail
cd "$(dirname "$0")/.."

.venv/Scripts/python.exe -m scripts.split_xiyouji
