"""
章/节标题是纯机械信息（原文标题标签里直接就有），不需要人工/LLM 参与，
所以不走 build_all_sections.py 那条"切分+人工产出"的流水线，独立生成、
直接写进正式的 packs/public/sicp/ 位置。
"""

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from generator.texinfo_html_adapter import TexinfoHtmlAdapter

SOURCE_DIR = Path("sources/sicp")
SOURCE_FILES = ["Chapter-1.xhtml", "1.1.xhtml", "1.2.xhtml", "1.3.xhtml"]
OUTPUT_PATH = Path("../packs/public/sicp/section_headings.json")


def main() -> None:
    adapter = TexinfoHtmlAdapter()
    paths = [str(SOURCE_DIR / name) for name in SOURCE_FILES]
    headings = adapter.extract_section_headings(paths)

    OUTPUT_PATH.write_text(
        json.dumps(headings, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {len(headings)} section headings to {OUTPUT_PATH}")
    for h in headings:
        print(f"  {'/'.join(h['path']):8s} {h['title']}")


if __name__ == "__main__":
    main()
