"""
把 Gatsby 全部 9 章的机械切分产物 + llm-output 组装成 pack-parts，支持增量重跑：
- 一章还没有 llm-output（还没手工产出）-> 标记"待生成"，不算失败，跳过它不影响其他章
- 一章的输入（机械切分产物 + llm-output）自上次构建以来没变 -> 跳过，直接复用上次的
  pack-parts 输出
- 变了或者从没构建过 -> 重新跑 slice_section，覆盖写 pack-parts

跟 build_all_sections.py（SICP）是同一套逻辑，只是路径/章节顺序换成 Gatsby。
id 分配同理不能每次全量从 0 重新编号：跳过的章节直接复用它 pack-parts 里已经写死
的 id，只有真正重新生成的章节才会从"目前用到的最大编号"继续往下发号——这一点对
Gatsby 尤其要紧：Chapter I 的 block id（b0001-b0014）已经写进了用户真实的
.kuibu-events-gatsby.jsonl，绝不能因为重新组装全书就被重新编号。
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

SECTIONS_DIR = Path("build/gatsby/sections")
LLM_OUTPUT_DIR = Path("build/gatsby/llm-output")
PACK_PARTS_DIR = Path("build/gatsby/pack-parts")

# 章节顺序 = 阅读顺序，跟 SICP 的 SECTION_ORDER 是同一个用途：不能用目录列出
# 顺序，文件系统不保证按这个排。
SECTION_ORDER = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]


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
            print(f"  chapter {name:3s} 跳过：机械切分产物缺失，先跑 split_gatsby.sh")
            pending.append(name)
            continue

        if not llm_path.exists():
            print(f"  chapter {name:3s} 待生成（还没有 llm-output）")
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
        f"完成：{len(built)} 章重新生成，{len(skipped)} 章跳过，"
        f"{len(pending)} 章待生成（共 {len(SECTION_ORDER)} 章）"
    )

    merged_path = Path("build/gatsby/merged-pack-parts.json")
    merged_path.write_text(
        json.dumps(
            {"blocks": all_blocks, "items": all_items, "questions": all_questions, "exercises": all_exercises},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        f"已生成章节合并进度写到 {merged_path}"
        f"（{len(all_blocks)} blocks, {len(all_items)} items, {len(all_questions)} questions, {len(all_exercises)} exercises）"
    )


if __name__ == "__main__":
    main()
