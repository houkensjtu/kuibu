"""
把 M3.22 的单节流程跑遍第一章全部小节（含章节引言的 2 个伪小节，共 20 个），支持增量重跑：
- 一个小节还没有 llm-output（还没生成/还没接 API）-> 标记"待生成"，不算失败，
  跳过它不影响其他小节
- 一个小节的输入（机械切分产物 + llm-output）自上次构建以来没变 -> 跳过，
  直接复用上次的 pack-parts 输出
- 变了或者从没构建过 -> 重新跑 slice_section，覆盖写 pack-parts

id 分配是这里最容易出错的地方：不能每次全量重新从 0 编号，否则一个小节
的内容没变、id 却因为前面某节新增了几个 block 而跟着挪位——用户事件日志
里记的 block_id/question_id 就全部对不上了。做法是跳过的小节直接复用它
pack-parts 里已经写死的 id，只有真正重新生成的小节才会从"目前用到的最大
编号"继续往下发号。
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

SECTIONS_DIR = Path("build/sicp/sections")
LLM_OUTPUT_DIR = Path("build/sicp/llm-output")
PACK_PARTS_DIR = Path("build/sicp/pack-parts")

# 章节顺序（不能用目录列出顺序，文件系统不保证按这个排）。
# 1.0.1/1.0.2 是 Chapter-1.xhtml（章节引言，没有编号小节）产出的伪小节，
# 排在 1.1 之前，见 texinfo_html_adapter.py 里对 "N.0.i" 编号的说明。
SECTION_ORDER = [
    "1.0.1", "1.0.2",
    "1.1.1", "1.1.2", "1.1.3", "1.1.4", "1.1.5", "1.1.6", "1.1.7", "1.1.8",
    "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5", "1.2.6",
    "1.3.1", "1.3.2", "1.3.3", "1.3.4",
]


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
    all_blocks, all_items, all_questions = [], [], []

    for name in SECTION_ORDER:
        section_path = SECTIONS_DIR / f"{name}.json"
        llm_path = LLM_OUTPUT_DIR / f"{name}.json"
        parts_path = PACK_PARTS_DIR / f"{name}.json"

        if not section_path.exists():
            print(f"  {name:8s} 跳过：机械切分产物缺失，先跑 split_sicp.sh")
            pending.append(name)
            continue

        if not llm_path.exists():
            print(f"  {name:8s} 待生成（还没有 LLM 输出）")
            pending.append(name)
            continue

        input_hash = _sha256(section_path) + ":" + _sha256(llm_path)
        cached = _load_cached_parts(parts_path, input_hash)

        if cached is not None:
            blocks, items, questions = cached["blocks"], cached["items"], cached["questions"]
            counters.seq = max(counters.seq, max((b["seq"] for b in blocks), default=0))
            counters.block = max(counters.block, _max_numeric_suffix([b["id"] for b in blocks]))
            counters.item = max(counters.item, _max_numeric_suffix([i["id"] for i in items]))
            counters.question = max(counters.question, _max_numeric_suffix([q["id"] for q in questions]))
            print(f"  {name:8s} 跳过（输入未变化）")
            skipped.append(name)
        else:
            subsection = Subsection.model_validate_json(section_path.read_text(encoding="utf-8"))
            llm_output = SectionLLMOutput.model_validate_json(llm_path.read_text(encoding="utf-8"))
            block_models, item_models, question_models = slice_section(subsection, llm_output, counters)
            blocks = [b.model_dump() for b in block_models]
            items = [i.model_dump() for i in item_models]
            questions = [q.model_dump(mode="json") for q in question_models]

            PACK_PARTS_DIR.mkdir(parents=True, exist_ok=True)
            parts_path.write_text(
                json.dumps(
                    {"_input_hash": input_hash, "blocks": blocks, "items": items, "questions": questions},
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            print(f"  {name:8s} 重新生成")
            built.append(name)

        all_blocks.extend(blocks)
        all_items.extend(items)
        all_questions.extend(questions)

    print(
        f"完成：{len(built)} 节重新生成，{len(skipped)} 节跳过，"
        f"{len(pending)} 节待生成（共 {len(SECTION_ORDER)} 节）"
    )

    merged_path = Path("build/sicp/merged-pack-parts.json")
    merged_path.write_text(
        json.dumps({"blocks": all_blocks, "items": all_items, "questions": all_questions}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"已生成小节合并进度写到 {merged_path}（{len(all_blocks)} blocks, {len(all_items)} items, {len(all_questions)} questions）")


if __name__ == "__main__":
    main()
