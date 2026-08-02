"""
机械切分《西游记》：epub -> 每回一个 JSON 文件。全程不调 LLM。
用 pack-gen/scripts/split_xiyouji.sh 跑，别直接跑这个文件（import 路径需要
pack-gen/ 在 sys.path 上，那个 shell 脚本负责把 cwd 切到正确位置）。
"""

import re
import sys
from pathlib import Path

from generator.gutenberg_txt_adapter import GutenbergTxtAdapter

# Windows 终端有时报告 cp1252 作为默认 stdout 编码，打印中文标题会崩；
# 显式转 utf-8。
sys.stdout.reconfigure(encoding="utf-8")

SOURCE_PATH = Path("sources/xiyouji/xiyouji.epub")
OUTPUT_DIR = Path("build/xiyouji/sections")

CHAPTER_HEADING_RE = re.compile(r"^第[一二三四五六七八九十百零○]+回")
START_MARKER = "START OF THE PROJECT GUTENBERG EBOOK"
END_MARKER = "END OF THE PROJECT GUTENBERG EBOOK"


def main() -> None:
    adapter = GutenbergTxtAdapter(
        chapter_heading_re=CHAPTER_HEADING_RE,
        start_marker=START_MARKER,
        end_marker=END_MARKER,
    )
    subsections = adapter.parse([str(SOURCE_PATH)])

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for sub in subsections:
        out_path = OUTPUT_DIR / f"{sub.section_path[-1]}.json"
        out_path.write_text(sub.model_dump_json(indent=2), encoding="utf-8")

    print(f"wrote {len(subsections)} chapters to {OUTPUT_DIR}/")
    for sub in subsections[:3]:
        print(f"  {sub.section_path[-1]:4s} {sub.section_title} ({len(sub.paragraphs)} paragraphs)")
    print("  ...")
    for sub in subsections[-3:]:
        print(f"  {sub.section_path[-1]:4s} {sub.section_title} ({len(sub.paragraphs)} paragraphs)")


if __name__ == "__main__":
    main()
