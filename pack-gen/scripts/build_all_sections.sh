#!/usr/bin/env bash
# 增量地把第一章所有小节的机械切分产物 + llm-output 组装成 pack-parts。
# 已经生成过、输入没变的小节会跳过；还没生成 llm-output 的小节会被标记为"待生成"。
set -euo pipefail
cd "$(dirname "$0")/.."

.venv/Scripts/python.exe -m scripts.build_all_sections
