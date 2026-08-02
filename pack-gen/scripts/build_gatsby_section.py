"""
用 slice_section 把一章的机械切分产物 + 手工 LLM 输出组装成 schema 形状的
block/item/question，写到 build/gatsby/pack-parts/<chapter>.json。

跟 build_section.py（SICP）是同一套流程，只是路径换成 gatsby——小说没有
Exercise，slice_section 返回的 exercises 列表永远是空的，仍然要写进
pack-parts 文件里，跟 build_all_sections.py 的合并逻辑保持一致的形状。
"""

import json
import sys
from pathlib import Path

# Windows 终端有时报告 cp1252 作为默认 stdout 编码，打印中文会崩；显式转 utf-8。
sys.stdout.reconfigure(encoding="utf-8")

from generator.section_llm_output import SectionLLMOutput
from generator.slice_section import IdCounters, slice_section
from generator.source_adapter import Subsection

SECTIONS_DIR = Path("build/gatsby/sections")
LLM_OUTPUT_DIR = Path("build/gatsby/llm-output")
OUTPUT_DIR = Path("build/gatsby/pack-parts")


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: build_gatsby_section.py <chapter>  (e.g. 1)", file=sys.stderr)
        sys.exit(1)

    chapter = sys.argv[1]
    subsection = Subsection.model_validate_json(
        (SECTIONS_DIR / f"{chapter}.json").read_text(encoding="utf-8")
    )
    llm_output = SectionLLMOutput.model_validate_json(
        (LLM_OUTPUT_DIR / f"{chapter}.json").read_text(encoding="utf-8")
    )

    blocks, items, questions, exercises = slice_section(subsection, llm_output, IdCounters())

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"{chapter}.json"
    out_path.write_text(
        json.dumps(
            {
                "blocks": [b.model_dump() for b in blocks],
                "items": [i.model_dump() for i in items],
                "questions": [q.model_dump(mode="json") for q in questions],
                "exercises": [e.model_dump() for e in exercises],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        f"wrote {len(blocks)} blocks, {len(items)} items, {len(questions)} questions, "
        f"{len(exercises)} exercises to {out_path}"
    )


if __name__ == "__main__":
    main()
