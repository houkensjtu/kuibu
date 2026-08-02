#!/usr/bin/env bash
# 把一章的机械切分产物 + 手工输出，切成 schema 形状的 block/item/question。
# 用法：pack-gen/scripts/build_gatsby_section.sh 1
set -euo pipefail
cd "$(dirname "$0")/.."

.venv/Scripts/python.exe -m scripts.build_gatsby_section "$1"
