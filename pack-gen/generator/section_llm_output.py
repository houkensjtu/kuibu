"""
"单小节 LLM 调用" 这一步真正要求 LLM 产出的形状（DESIGN.md §8.2）：只给块边界
索引 + 元数据，绝不复述原文——原文由 slice_section.py 按边界从 Subsection
的 paragraphs 里切出来。这份 schema 现在既用于手工产出（本步骤），将来接
真正的 LLM API 时也是同一份契约，prompt 只是要求模型返回这个形状的 JSON。
"""

from typing import List

from pydantic import BaseModel


class BlockSpec(BaseModel):
    """一个原子块的边界（对 Subsection.paragraphs 的下标，闭区间）+ 元数据。"""

    start_paragraph_index: int
    end_paragraph_index: int
    est_seconds: int
    recap_md: str


class KnowledgeItemSpec(BaseModel):
    statement: str
    # 指向本节 blocks 列表的下标（0-based，局部于这一节，不是全局 block id）
    block_indices: List[int]


class QuestionSpec(BaseModel):
    # 指向本节 knowledge_items 列表的下标
    item_index: int
    prompt: str
    options: List[str]
    answer_index: int
    explanation: str


class SectionLLMOutput(BaseModel):
    blocks: List[BlockSpec]
    knowledge_items: List[KnowledgeItemSpec]
    questions: List[QuestionSpec]
