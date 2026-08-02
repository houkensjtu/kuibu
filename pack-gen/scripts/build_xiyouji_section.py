"""
用 slice_section 把一回的机械切分产物 + 手工输出，切成 schema 形状的
block/item/question。跟 build_gatsby_section.py 是同一套流程，换成西游记
的路径——古典小说同样没有 Exercise，exercises 列表永远是空的。
"""

import json
import sys
from pathlib import Path

# Windows 终端有时报告 cp1252 作为默认 stdout 编码，打印中文会崩；显式转 utf-8。
sys.stdout.reconfigure(encoding="utf-8")

from generator.section_llm_output import SectionLLMOutput
from generator.slice_section import IdCounters, slice_section
from generator.source_adapter import Subsection

SECTIONS_DIR = Path("build/xiyouji/sections")
LLM_OUTPUT_DIR = Path("build/xiyouji/llm-output")
OUTPUT_DIR = Path("build/xiyouji/pack-parts")


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: build_xiyouji_section.py <chapter>  (e.g. 1)", file=sys.stderr)
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
