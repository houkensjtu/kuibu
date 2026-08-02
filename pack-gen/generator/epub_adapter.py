"""
解析标准 epub（zip 容器 + OPF manifest/spine）——目前用来验证的是 Project
Gutenberg 官方 epub（The Great Gatsby, ebook #64317），实测下来它跟 SICP 的
texinfo HTML 源码结构完全不同（DESIGN.md §14.3 记录了完整推导过程）：

- epub 是标准 zip：`META-INF/container.xml` 指向 `content.opf`，OPF 的
  `<spine>` 按 idref 顺序决定阅读顺序（不是 `<manifest>` 里的文件列表顺序）。
- 全书正文摊在 spine 里的几个 xhtml 文件里，不是像 SICP 源码那样每个小节
  单独一个文件；Gutenberg 的页眉/页脚样板文本（版权声明、生成器信息）
  会跟正文章节混在同一个文件里。
- 每一章是一个 `<div id="chapter-N">`（N 是章节序号的阿拉伯数字，机械可
  提取，不需要猜测罗马数字怎么转换）内的 `<h2>罗马数字</h2>` + 一串
  `<p>`/`<ul>`/`<table>`/`<blockquote>`/`<hr/>`——只要在文档里搜索这个 id
  模式，页眉/页脚样板（TOC、标题页、Gutenberg 许可证正文）天然被排除在外，
  不需要单独判断"这个文件要不要整篇跳过"。
- 小说没有 SICP 那种代码块/脚注，但有诗体引文（`<br/>` 分行的 verse
  blockquote）和一处表格（Gatsby 父亲展示的少年时代作息表）——都需要专门
  处理，不能直接照抄 texinfo 那套。
"""

import re
import warnings
from typing import List

from bs4 import BeautifulSoup, Tag, XMLParsedAsHTMLWarning

from .epub_zip import read_spine_documents
from .html_text import clean_text as _clean_text
from .html_text import render_inline as _render_inline
from .source_adapter import Paragraph, ParagraphKind, Subsection

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

_CHAPTER_ID_RE = re.compile(r"^chapter-(\d+)$")


def _paragraphs_from_element(el: Tag) -> List[Paragraph]:
    if el.name == "p":
        text = _clean_text(_render_inline(el))
        return [Paragraph(kind=ParagraphKind.text, text=text)] if text else []

    if el.name in ("ul", "ol"):
        lines = []
        for li in el.find_all("li", recursive=False):
            text = _clean_text(_render_inline(li))
            if text:
                lines.append(f"- {text}")
        return [Paragraph(kind=ParagraphKind.text, text="\n".join(lines))] if lines else []

    if el.name == "table":
        rows = []
        for tr in el.find_all("tr"):
            cells = [_clean_text(_render_inline(td)) for td in tr.find_all("td")]
            row = "  ".join(cell for cell in cells if cell)
            if row:
                rows.append(row)
        return [Paragraph(kind=ParagraphKind.text, text="\n".join(rows))] if rows else []

    if el.name == "hr":
        # 章内场景分隔符，不是新章节（DESIGN.md §14.3）——渲染成一个显式的
        # 纯文本标记，不然连续两个场景在阅读时会毫无提示地粘在一起。
        return [Paragraph(kind=ParagraphKind.text, text="* * *")]

    if el.name in ("blockquote", "div"):
        # 诗体引文是 <blockquote class="verse"><div><p>...</p></div></blockquote>，
        # 附作息表的那处是 <blockquote><div><p class="header">...</p><ul>...</ul></div></blockquote>
        # ——两种都是"容器套容器"，没有固定深度，递归展开子元素最稳妥。
        paragraphs: List[Paragraph] = []
        for child in el.find_all(recursive=False):
            if isinstance(child, Tag):
                paragraphs.extend(_paragraphs_from_element(child))
        return paragraphs

    return []


def _chapter_number(chapter_div: Tag) -> str:
    match = _CHAPTER_ID_RE.match(chapter_div.get("id", ""))
    if match is None:
        raise ValueError(f"unrecognized chapter div id: {chapter_div.get('id')!r}")
    return str(int(match.group(1)))


def _chapter_title(chapter_div: Tag) -> str:
    heading = chapter_div.find("h2", recursive=False)
    if heading is None:
        raise ValueError(f"chapter div {chapter_div.get('id')!r} has no <h2> heading")
    return _clean_text(_render_inline(heading))


class EpubAdapter:
    def parse(self, source_paths: List[str]) -> List[Subsection]:
        result: List[Subsection] = []
        for path in source_paths:
            result.extend(self._parse_epub(path))
        return result

    def extract_section_headings(self, source_paths: List[str]) -> List[dict]:
        """小说目前只有"章"这一级 section_path（没有 SICP 那种章/节/小节
        三层），章本身就是叶子，标题直接来自 block.section_title——没有
        更高层级需要额外的 SectionHeading 行，返回空列表就是正确答案，
        不是遗漏。"""
        return []

    def _parse_epub(self, epub_path: str) -> List[Subsection]:
        subsections: List[Subsection] = []
        for content in read_spine_documents(epub_path):
            subsections.extend(self._parse_xhtml(content))
        return subsections

    def _parse_xhtml(self, content: str) -> List[Subsection]:
        soup = BeautifulSoup(content, "lxml")
        subsections: List[Subsection] = []
        for chapter_div in soup.find_all("div", id=_CHAPTER_ID_RE):
            subsections.append(self._parse_chapter(chapter_div))
        return subsections

    def _parse_chapter(self, chapter_div: Tag) -> Subsection:
        chapter_num = _chapter_number(chapter_div)
        chapter_title = _chapter_title(chapter_div)

        paragraphs: List[Paragraph] = []
        for el in chapter_div.find_all(recursive=False):
            if not isinstance(el, Tag):
                continue
            if el.name == "h2":
                continue  # 已经在上面读过章节标题了
            paragraphs.extend(_paragraphs_from_element(el))

        return Subsection(
            section_path=[chapter_num],
            section_title=chapter_title,
            paragraphs=paragraphs,
        )
