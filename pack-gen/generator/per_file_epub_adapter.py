"""
解析"每章一个 xhtml 文件"的 epub——跟 `epub_adapter.py`（多章挤在几个 spine
文件里，靠 `<div id="chapter-N">` 分章）和 `gutenberg_txt_adapter.py`（全书
正文是单个 spine 文件里一串平铺的 `<p>`，靠正则识别章节标题行）都不一样，
是第三种结构（实测《史蒂夫·乔布斯传》epub 验证，工具链签名是 Sigil/cnepub）：

- spine 里的每个文件本身就是一个独立的"节"（章节正文、前言、致谢……），
  不需要在文件内部再切分——文件边界就是节边界。
- 每个文件里只有一个标题标签（`<h1>`-`<h6>` 之一，这本书里是 `<h3>`），
  后面跟着一串平铺的 `<p>`，没有 `<div id="chapter-N">` 那种容器。
- **文件名数字顺序不可信**：这本书的 spine 里 `chapter32.html` 排在
  `chapter31.html` 前面（第二十六章排在第二十五章前面的文件名，但 spine
  顺序是对的）——必须用 `read_spine_documents` 返回的 spine 阅读顺序，不能
  按文件名排序。
- **不是所有 spine 文件都是要收录的正文**：同一份 spine 里混着封面、目录、
  "本书作者"之类的标签页、也可能有致谢/摄影集之类书末非叙事内容——由调用方
  传入一个"这个标题该不该收录"的判断函数，跟 `GutenbergTxtAdapter` 的
  `chapter_heading_re` 是同一个"不把选书范围的判断权硬编码进 adapter 本身"
  的思路，只是这里判断的是"要不要"而不是"往正文里插入一个新章节边界"（因为
  这里章节边界=文件边界，天然不需要在文件内部找边界）。
- 跟 `GutenbergTxtAdapter` 一样，章节序号不信任原文数字，只按被收录的顺序
  自己编号——原文标题字符串原样保留在 section_title 里。这本书的章节数字
  写法其实是规整的（都是标准中文数字"第一章".."第四十一章"，没有西游记那种
  逐位读数/"○"混用的问题），但仍然按这条已验证的原则来，因为编号的意义
  只是给 section_path 一个稳定顺序，不需要跟原文数字对应。
"""

import re
import warnings
from typing import Callable, List

from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

from .epub_zip import read_spine_documents
from .html_text import clean_text, render_inline
from .source_adapter import Paragraph, ParagraphKind, Subsection

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

_HEADING_TAG_RE = re.compile(r"^h[1-6]$")


class PerFileEpubAdapter:
    def __init__(self, include_heading: Callable[[str], bool]):
        self._include_heading = include_heading

    def parse(self, source_paths: List[str]) -> List[Subsection]:
        subsections: List[Subsection] = []
        seq = 0

        for path in source_paths:
            for doc in read_spine_documents(path):
                soup = BeautifulSoup(doc, "lxml")
                heading = soup.find(_HEADING_TAG_RE)
                if heading is None:
                    continue  # 没有标题标签的文件（比如纯图片的封底页），整篇跳过

                title = clean_text(render_inline(heading))
                if not title or not self._include_heading(title):
                    continue

                seq += 1
                paragraphs: List[Paragraph] = []
                for p in soup.find_all("p"):
                    text = clean_text(render_inline(p))
                    if text:
                        paragraphs.append(Paragraph(kind=ParagraphKind.text, text=text))

                subsections.append(
                    Subsection(
                        section_path=[str(seq)],
                        section_title=title,
                        paragraphs=paragraphs,
                    )
                )

        return subsections

    def extract_section_headings(self, source_paths: List[str]) -> List[dict]:
        """只有"章"这一级 section_path，章本身就是叶子，没有更高层级需要
        额外的 SectionHeading 行（跟 EpubAdapter/GutenbergTxtAdapter 同理）。"""
        return []
