#!/usr/bin/env bash
# 机械切分乔布斯传 epub 成每节一个 JSON（不调 LLM）。
set -euo pipefail
cd "$(dirname "$0")/.."

.venv/Scripts/python.exe -m scripts.split_sjobs
