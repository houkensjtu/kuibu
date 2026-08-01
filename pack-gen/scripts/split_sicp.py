"""
机械切分 SICP 第一章：源 HTML -> 每个小节一个 JSON 文件。全程不调 LLM。
用 pack-gen/scripts/split_sicp.sh 跑，别直接跑这个文件（import 路径需要
pack-gen/ 在 sys.path 上，那个 shell 脚本负责把 cwd 切到正确位置）。
"""

import sys
from pathlib import Path

from generator.texinfo_html_adapter import TexinfoHtmlAdapter

# Windows 终端有时报告 cp1252 作为默认 stdout 编码，打印中文标题会崩；
# 显式转 utf-8。
sys.stdout.reconfigure(encoding="utf-8")

SOURCE_DIR = Path("sources/sicp")
OUTPUT_DIR = Path("build/sicp/sections")
# Chapter-1.xhtml must come first: it has no numbered section, so it produces
# the "1.0.*" pseudo-subsections that should be read before 1.1 starts.
SOURCE_FILES = ["Chapter-1.xhtml", "1.1.xhtml", "1.2.xhtml", "1.3.xhtml"]


def main() -> None:
    adapter = TexinfoHtmlAdapter()
    paths = [str(SOURCE_DIR / name) for name in SOURCE_FILES]
    subsections = adapter.parse(paths)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for sub in subsections:
        # section_path 的每一段本身可能带小数点（如 "1.1.7"），文件名只用最后一段
        # ——不能把整个 section_path 数组再 join(".") 一次，否则会重复拼出
        # "1.1.1.1.1.7.json" 这种荒谬的文件名。
        out_path = OUTPUT_DIR / f"{sub.section_path[-1]}.json"
        out_path.write_text(sub.model_dump_json(indent=2), encoding="utf-8")

    print(f"wrote {len(subsections)} subsections to {OUTPUT_DIR}/")
    for sub in subsections:
        print(f"  {sub.section_path[-1]:8s} {sub.section_title} ({len(sub.paragraphs)} paragraphs)")


if __name__ == "__main__":
    main()
