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


class ExerciseSpec(BaseModel):
    """
    原书自己的习题（Exercise N.M），跟"复习题"（QuestionSpec）是两种不同的东西：
    复习题是每天必做、离线自动判分的选择题；习题是可选做的开放题，不判分，
    只在用户主动要求时给一条提示（hint_md，由本步骤产出，不是原文，允许改写），
    暂不提供答案。

    跟 BlockSpec 一样，习题原文（prompt_md）必须是从 paragraphs 按边界切出来的
    原文，不能复述——只给边界索引，see 铁律 6。block_id 不用手动指定，由
    slice_section.py 根据 start_paragraph_index 落在哪个 block 的范围内自动
    推出来。
    """

    number: str  # 原书编号，如 "1.9"
    start_paragraph_index: int
    end_paragraph_index: int
    hint_md: str


class SectionLLMOutput(BaseModel):
    blocks: List[BlockSpec]
    knowledge_items: List[KnowledgeItemSpec]
    questions: List[QuestionSpec]
    exercises: List[ExerciseSpec] = []
