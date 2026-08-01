"""
源文件 -> 归一化的带结构纯文本（DESIGN.md §8.3）。

下游（机械切分脚本、LLM 调用）只认这里定义的 Subsection/Paragraph 形状，
不关心某本书的源文件原来是 HTML、epub 还是别的什么格式——这是新书接入
只需要新写一个 Adapter、不用碰下游代码的前提。
"""

from enum import Enum
from typing import List, Protocol

from pydantic import BaseModel


class ParagraphKind(str, Enum):
    text = "text"
    # 代码块必须逐字保留，绝不能被下游（尤其是 LLM）改写一个字符
    # ——这是铁律 6 的起点：等到了切块那一步，LLM 只给边界索引，原文由脚本
    # 按索引切割，但前提是这里的 "code" 段本身就必须是源文件的逐字内容。
    code = "code"


class Paragraph(BaseModel):
    kind: ParagraphKind
    text: str


class Subsection(BaseModel):
    """一个小节（如 1.1.1）机械切分后的结果，段落顺序保留源文件里的原始顺序。"""

    section_path: List[str]
    section_title: str
    paragraphs: List[Paragraph]


class SourceAdapter(Protocol):
    def parse(self, source_paths: List[str]) -> List[Subsection]:
        """把一组源文件解析成按小节分好组的 Subsection 列表，顺序即阅读顺序。"""
        ...
