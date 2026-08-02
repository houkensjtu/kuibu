"""
机械切分 The Great Gatsby：epub -> 每章一个 JSON 文件。全程不调 LLM。
用 pack-gen/scripts/split_gatsby.sh 跑，别直接跑这个文件（import 路径需要
pack-gen/ 在 sys.path 上，那个 shell 脚本负责把 cwd 切到正确位置）。
"""

import sys
from pathlib import Path

from generator.epub_adapter import EpubAdapter

# Windows 终端有时报告 cp1252 作为默认 stdout 编码，打印中文标题会崩；
# 显式转 utf-8。
sys.stdout.reconfigure(encoding="utf-8")

SOURCE_PATH = Path("sources/gatsby/gatsby.epub")
OUTPUT_DIR = Path("build/gatsby/sections")


def main() -> None:
    adapter = EpubAdapter()
    subsections = adapter.parse([str(SOURCE_PATH)])

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for sub in subsections:
        out_path = OUTPUT_DIR / f"{sub.section_path[-1]}.json"
        out_path.write_text(sub.model_dump_json(indent=2), encoding="utf-8")

    print(f"wrote {len(subsections)} chapters to {OUTPUT_DIR}/")
    for sub in subsections:
        print(f"  {sub.section_path[-1]:8s} {sub.section_title} ({len(sub.paragraphs)} paragraphs)")


if __name__ == "__main__":
    main()
