"""
把《西游记》已经手工产出 llm-output 的回目组装成 pack-parts，支持增量重跑。
跟 build_all_gatsby_sections.py 是同一套逻辑，换成西游记的路径和 100 回的
顺序——这一轮只有前 10 回有 llm-output（第一批预览，等用户验收后再铺开
剩余 90 回），其余回自动落入"待生成"，不算失败。
"""

import hashlib
import json
import sys
from pathlib import Path
from typing import Optional

# Windows 终端在某些环境下报告的默认 stdout 编码是 cp1252，一打印中文就
# UnicodeEncodeError；显式转成 utf-8，不依赖当时终端/环境变量的状态。
sys.stdout.reconfigure(encoding="utf-8")

from generator.section_llm_output import SectionLLMOutput
from generator.slice_section import IdCounters, slice_section
from generator.source_adapter import Subsection

SECTIONS_DIR = Path("build/xiyouji/sections")
LLM_OUTPUT_DIR = Path("build/xiyouji/llm-output")
PACK_PARTS_DIR = Path("build/xiyouji/pack-parts")

SECTION_ORDER = [str(n) for n in range(1, 101)]


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _max_numeric_suffix(ids: list) -> int:
    return max((int(i[1:]) for i in ids), default=0)


def _load_cached_parts(parts_path: Path, expected_hash: str) -> Optional[dict]:
    if not parts_path.exists():
        return None
    cached = json.loads(parts_path.read_text(encoding="utf-8"))
    return cached if cached.get("_input_hash") == expected_hash else None


def main() -> None:
    counters = IdCounters()
    built, skipped, pending = [], [], []
    all_blocks, all_items, all_questions, all_exercises = [], [], [], []

    for name in SECTION_ORDER:
        section_path = SECTIONS_DIR / f"{name}.json"
        llm_path = LLM_OUTPUT_DIR / f"{name}.json"
        parts_path = PACK_PARTS_DIR / f"{name}.json"

        if not section_path.exists():
            pending.append(name)
            continue

        if not llm_path.exists():
            pending.append(name)
            continue

        input_hash = _sha256(section_path) + ":" + _sha256(llm_path)
        cached = _load_cached_parts(parts_path, input_hash)

        if cached is not None:
            blocks, items, questions = cached["blocks"], cached["items"], cached["questions"]
            exercises = cached.get("exercises", [])
            counters.seq = max(counters.seq, max((b["seq"] for b in blocks), default=0))
            counters.block = max(counters.block, _max_numeric_suffix([b["id"] for b in blocks]))
            counters.item = max(counters.item, _max_numeric_suffix([i["id"] for i in items]))
            counters.question = max(counters.question, _max_numeric_suffix([q["id"] for q in questions]))
            counters.exercise = max(counters.exercise, _max_numeric_suffix([e["id"] for e in exercises]))
            print(f"  chapter {name:3s} 跳过（输入未变化）")
            skipped.append(name)
        else:
            subsection = Subsection.model_validate_json(section_path.read_text(encoding="utf-8"))
            llm_output = SectionLLMOutput.model_validate_json(llm_path.read_text(encoding="utf-8"))
            block_models, item_models, question_models, exercise_models = slice_section(
                subsection, llm_output, counters
            )
            blocks = [b.model_dump() for b in block_models]
            items = [i.model_dump() for i in item_models]
            questions = [q.model_dump(mode="json") for q in question_models]
            exercises = [e.model_dump() for e in exercise_models]

            PACK_PARTS_DIR.mkdir(parents=True, exist_ok=True)
            parts_path.write_text(
                json.dumps(
                    {
                        "_input_hash": input_hash,
                        "blocks": blocks,
                        "items": items,
                        "questions": questions,
                        "exercises": exercises,
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            print(f"  chapter {name:3s} 重新生成")
            built.append(name)

        all_blocks.extend(blocks)
        all_items.extend(items)
        all_questions.extend(questions)
        all_exercises.extend(exercises)

    print(
        f"完成：{len(built)} 回重新生成，{len(skipped)} 回跳过，"
        f"{len(pending)} 回待生成（共 {len(SECTION_ORDER)} 回）"
    )

    merged_path = Path("build/xiyouji/merged-pack-parts.json")
    merged_path.write_text(
        json.dumps(
            {"blocks": all_blocks, "items": all_items, "questions": all_questions, "exercises": all_exercises},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        f"已生成回目合并进度写到 {merged_path}"
        f"（{len(all_blocks)} blocks, {len(all_items)} items, {len(all_questions)} questions, {len(all_exercises)} exercises）"
    )


if __name__ == "__main__":
    main()
