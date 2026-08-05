"""
机械切分《史蒂夫·乔布斯传》epub -> 每节一个 JSON 文件。全程不调 LLM。
用 pack-gen/scripts/split_sjobs.sh 跑，别直接跑这个文件（import 路径需要
pack-gen/ 在 sys.path 上，那个 shell 脚本负责把 cwd 切到正确位置）。

私有书，源文件和输出全部落在 pack-gen/sources/private/ 和
pack-gen/build/private/ 下——这两个目录树整体 gitignore（见 .gitignore 和
CLAUDE.md/DESIGN.md §4.5），不是逐个文件手动排除。
"""

import re
import sys
from pathlib import Path
from typing import List, Optional

from generator.per_file_epub_adapter import PerFileEpubAdapter
from generator.source_adapter import Subsection

# Windows 终端有时报告 cp1252 作为默认 stdout 编码，打印中文标题会崩；
# 显式转 utf-8。
sys.stdout.reconfigure(encoding="utf-8")

SOURCE_PATH = Path("sources/private/sjobs/乔布斯传.epub")
OUTPUT_DIR = Path("build/private/sjobs/sections")

CHAPTER_RE = re.compile(r"^第([一二三四五六七八九十]+)章")
FOREWORD_TITLE = "前言 本书是如何诞生的"
AFTERWORD_TITLE = "尾声"

_CN_DIGITS = {"零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def _parse_chinese_number(text: str) -> int:
    """够用就好：这本书的章节数字全部落在 1-41，标准中文数字读法（不像
    西游记那本书混用逐位读数/"○"代替零），"十"/"二十六"/"四十一" 这种
    两位数模式就够覆盖，不需要处理更大的数字或其他读法。"""
    if text == "十":
        return 10
    if "十" in text:
        tens_part, _, ones_part = text.partition("十")
        tens = _CN_DIGITS[tens_part] if tens_part else 1
        ones = _CN_DIGITS[ones_part] if ones_part else 0
        return tens * 10 + ones
    return _CN_DIGITS[text]


def _chapter_number(title: str) -> Optional[int]:
    match = CHAPTER_RE.match(title)
    return _parse_chinese_number(match.group(1)) if match else None


def include_heading(title: str) -> bool:
    return _chapter_number(title) is not None or title in (FOREWORD_TITLE, AFTERWORD_TITLE)


def _sort_key(subsection: Subsection):
    title = subsection.section_title
    if title == FOREWORD_TITLE:
        return (0, 0)
    if title == AFTERWORD_TITLE:
        return (2, 0)
    return (1, _chapter_number(title))


def reorder_and_renumber(subsections: List[Subsection]) -> List[Subsection]:
    """adapter.parse() 忠实反映 epub 的 <spine> 声明顺序（见
    generator/per_file_epub_adapter.py 的模块 docstring）；这本书的
    <spine> 本身有一处真实的作者/工具错误——chapter32.html（第二十六章）
    排在 chapter31.html（第二十五章）前面，跟文件名、标题文字里的数字都对
    不上。既然这本书的章节数字写法本身是规整的（跟西游记不一样，不需要
    "不信任原文数字"那条防线），按解析出的数字重新排序、再顺序重新赋值
    section_path，就是这处真实缺陷唯一需要的修正——不在 adapter 里做，
    因为那是这本书独有的数据质量问题，不是所有用这个 adapter 的书都有。
    """
    reordered = sorted(subsections, key=_sort_key)
    for i, subsection in enumerate(reordered, start=1):
        subsection.section_path = [str(i)]
    return reordered


def main() -> None:
    adapter = PerFileEpubAdapter(include_heading=include_heading)
    raw = adapter.parse([str(SOURCE_PATH)])

    raw_titles = [s.section_title for s in raw]
    corrected = reorder_and_renumber(raw)
    corrected_titles = [s.section_title for s in corrected]

    if raw_titles != corrected_titles:
        moved = [
            (i, raw_title, corrected_titles[i])
            for i, raw_title in enumerate(raw_titles)
            if raw_title != corrected_titles[i]
        ]
        print(f"corrected {len(moved)} out-of-order section(s) (spine authoring bug, see module docstring):")
        for i, before, after in moved:
            print(f"  position {i + 1}: spine gave {before!r}, corrected to {after!r}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for sub in corrected:
        out_path = OUTPUT_DIR / f"{sub.section_path[-1]}.json"
        out_path.write_text(sub.model_dump_json(indent=2), encoding="utf-8")

    print(f"wrote {len(corrected)} sections to {OUTPUT_DIR}/")
    for sub in corrected[:3]:
        print(f"  {sub.section_path[-1]:>2s} {sub.section_title} ({len(sub.paragraphs)} paragraphs)")
    print("  ...")
    for sub in corrected[-3:]:
        print(f"  {sub.section_path[-1]:>2s} {sub.section_title} ({len(sub.paragraphs)} paragraphs)")


if __name__ == "__main__":
    main()
