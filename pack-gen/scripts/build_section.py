"""
用 slice_section 把一个小节的机械切分产物 + LLM 输出组装成 schema 形状的
block/item/question，写到 build/sicp/pack-parts/<subsection>.json。

当前手工产出 LLM 输出（M3.22，还没接真实 API），所以这个脚本只处理已经
手工写好 llm-output 的小节；全章批量跑是下一步（M3.23）的事。
"""

import json
import sys
from pathlib import Path

from generator.section_llm_output import SectionLLMOutput
from generator.slice_section import IdCounters, slice_section
from generator.source_adapter import Subsection

SECTIONS_DIR = Path("build/sicp/sections")
LLM_OUTPUT_DIR = Path("build/sicp/llm-output")
OUTPUT_DIR = Path("build/sicp/pack-parts")


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: build_section.py <subsection>  (e.g. 1.1.1)", file=sys.stderr)
        sys.exit(1)

    subsection_name = sys.argv[1]
    subsection = Subsection.model_validate_json(
        (SECTIONS_DIR / f"{subsection_name}.json").read_text(encoding="utf-8")
    )
    llm_output = SectionLLMOutput.model_validate_json(
        (LLM_OUTPUT_DIR / f"{subsection_name}.json").read_text(encoding="utf-8")
    )

    blocks, items, questions = slice_section(subsection, llm_output, IdCounters())

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"{subsection_name}.json"
    out_path.write_text(
        json.dumps(
            {
                "blocks": [b.model_dump() for b in blocks],
                "items": [i.model_dump() for i in items],
                "questions": [q.model_dump(mode="json") for q in questions],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"wrote {len(blocks)} blocks, {len(items)} items, {len(questions)} questions to {out_path}")


if __name__ == "__main__":
    main()
