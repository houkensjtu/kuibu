#!/usr/bin/env bash
# 把一个小节的机械切分产物 + 手工/LLM 输出，切成 schema 形状的 block/item/question。
# 用法：pack-gen/scripts/build_section.sh 1.1.1
set -euo pipefail
cd "$(dirname "$0")/.."

.venv/Scripts/python.exe -m scripts.build_section "$1"
