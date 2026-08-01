"""
把 Subsection（机械切分产物）+ SectionLLMOutput（LLM 只给的边界索引 + 元数据）
组装成 schema 形状的 Block/KnowledgeItem/Question。

铁律 6 落地的地方：content_md 永远是从 subsection.paragraphs 按下标切出来的
原文，LLM 自己的输出里完全不含正文文字，所以这里不存在"LLM 悄悄改写了代码"
的风险——它压根没看到过要改写的东西，只给了个下标。

IdCounters 是可变的，跨小节调用时传同一个实例，好让 block/item/question 的
编号在全书范围内连续递增（M3.23 的全章流水线会这样用）。
"""

from dataclasses import dataclass, field
from typing import List, Tuple

from generator.section_llm_output import SectionLLMOutput
from generator.source_adapter import Paragraph, ParagraphKind, Subsection
from models.pack import Block, Exercise, KnowledgeItem, Question, Type


@dataclass
class IdCounters:
    seq: int = 0
    block: int = 0
    item: int = 0
    question: int = 0
    exercise: int = 0


def _render_content_md(paragraphs: List[Paragraph]) -> str:
    parts = []
    for p in paragraphs:
        if p.kind == ParagraphKind.code:
            parts.append(f"```scheme\n{p.text}\n```")
        else:
            parts.append(p.text)
    return "\n\n".join(parts)


def slice_section(
    subsection: Subsection,
    llm_output: SectionLLMOutput,
    counters: IdCounters,
) -> Tuple[List[Block], List[KnowledgeItem], List[Question], List[Exercise]]:
    blocks: List[Block] = []
    for spec in llm_output.blocks:
        counters.seq += 1
        counters.block += 1
        paragraphs = subsection.paragraphs[
            spec.start_paragraph_index : spec.end_paragraph_index + 1
        ]
        blocks.append(
            Block(
                id=f"b{counters.block:04d}",
                seq=counters.seq,
                section_path=subsection.section_path,
                section_title=subsection.section_title,
                content_md=_render_content_md(paragraphs),
                est_seconds=spec.est_seconds,
                recap_md=spec.recap_md,
            )
        )

    # 先按 item_index 把 question id 分组，因为 KnowledgeItem.question_ids
    # 至少要有一个元素，不能先建一个空列表的 item 再回头补——pydantic 校验
    # 在构造那一刻就会失败。
    question_ids_by_item_index: dict[int, List[str]] = {
        i: [] for i in range(len(llm_output.knowledge_items))
    }
    question_ids: List[str] = []
    for qspec in llm_output.questions:
        counters.question += 1
        q_id = f"q{counters.question:04d}"
        question_ids.append(q_id)
        question_ids_by_item_index[qspec.item_index].append(q_id)

    items: List[KnowledgeItem] = []
    for i, ispec in enumerate(llm_output.knowledge_items):
        counters.item += 1
        items.append(
            KnowledgeItem(
                id=f"k{counters.item:04d}",
                block_ids=[blocks[bi].id for bi in ispec.block_indices],
                statement=ispec.statement,
                question_ids=question_ids_by_item_index[i],
            )
        )

    questions: List[Question] = []
    for q_id, qspec in zip(question_ids, llm_output.questions):
        questions.append(
            Question(
                id=q_id,
                item_id=items[qspec.item_index].id,
                type=Type.single_choice,
                prompt=qspec.prompt,
                options=qspec.options,
                answer_index=qspec.answer_index,
                explanation=qspec.explanation,
            )
        )

    exercises: List[Exercise] = []
    for espec in llm_output.exercises:
        counters.exercise += 1
        paragraphs = subsection.paragraphs[
            espec.start_paragraph_index : espec.end_paragraph_index + 1
        ]
        # 习题解锁的 block = 覆盖了这道习题起始段落的那个 block——不要求
        # LLM 手动指定 block_id，避免它跟 block 边界的另一份真相来源脱节。
        owning_block = next(
            b
            for bspec, b in zip(llm_output.blocks, blocks)
            if bspec.start_paragraph_index <= espec.start_paragraph_index <= bspec.end_paragraph_index
        )
        exercises.append(
            Exercise(
                id=f"x{counters.exercise:04d}",
                block_id=owning_block.id,
                number=espec.number,
                prompt_md=_render_content_md(paragraphs),
                hint_md=espec.hint_md,
            )
        )

    return blocks, items, questions, exercises
