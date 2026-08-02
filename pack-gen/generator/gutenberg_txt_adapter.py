"""
解析 Project Gutenberg 用纯文本（.txt）源转换出的 epub——跟 `epub_adapter.py`
处理的"ebookmaker HTML 源"完全不同结构（实测西游记 ebook #23962 验证）：

- 没有 `<div id="chapter-N">` 包装。全书正文就是 spine 文件里一串平铺的
  兄弟 `<p>` 标签（外加偶尔出现的 `<br/>`），章节靠正文自己的标题行识别，
  不是靠容器元素——调用方传入一个"这段文本是不是章节标题"的正则。
- 正文范围由 Gutenberg 自己的样板标记界定：`*** START OF THE PROJECT
  GUTENBERG EBOOK ... ***` 和 `*** END OF ... ***`，两条都是独立的一段
  文本，直接按子串匹配定位，不需要像 Gatsby 那样靠"文件里有没有 chapter
  div"这种间接信号。
- 章节序号不信任原文数字：西游记这个 Gutenberg 转录版章节数字写法本身不
  统一（"第一回".."第九回" 用标准数字，往后有的用逐位读数"第一二回"（十二），
  有的又用标准复合数"第八十七回"，十位数为零时甚至用"○"这个符号代替，
  两种字体还都出现过），与其解析这堆不一致的写法，不如按遇到章节标题的
  实际顺序自己编号——原文标题字符串原样保留在 section_title 里，读者看到
  的还是原文，只是 section_path 的编号是我们自己按出现顺序给的。
"""

import warnings
from typing import List, Optional, Pattern

from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

from .epub_zip import read_spine_documents
from .html_text import clean_text, render_inline
from .source_adapter import Paragraph, ParagraphKind, Subsection

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)


class GutenbergTxtAdapter:
    def __init__(self, chapter_heading_re: Pattern[str], start_marker: str, end_marker: str):
        self._chapter_heading_re = chapter_heading_re
        self._start_marker = start_marker
        self._end_marker = end_marker

    def parse(self, source_paths: List[str]) -> List[Subsection]:
        # 开始/结束样板标记实测是裸 <span>，不在任何 <p> 里面（跟 Gatsby 的
        # <div id="chapter-N"> 不一样，这里没有语义容器可以按标签找）——按
        # 原始字符串子串定位、直接在字符串层面裁掉样板部分，再交给
        # BeautifulSoup 解析剩下的部分，不依赖标记具体被哪个标签包着。
        subsections: List[Subsection] = []
        chapter_num = 0
        current_title: Optional[str] = None
        current_paragraphs: List[Paragraph] = []
        in_content = False
        done = False

        def flush() -> None:
            if current_title is not None:
                subsections.append(
                    Subsection(
                        section_path=[str(chapter_num)],
                        section_title=current_title,
                        paragraphs=current_paragraphs,
                    )
                )

        for path in source_paths:
            if done:
                break
            for doc in read_spine_documents(path):
                if done:
                    break

                if not in_content:
                    start_idx = doc.find(self._start_marker)
                    if start_idx == -1:
                        continue  # 整篇都在开始标记之前（封面页等），跳过
                    doc = doc[start_idx + len(self._start_marker) :]
                    in_content = True

                end_idx = doc.find(self._end_marker)
                if end_idx != -1:
                    doc = doc[:end_idx]
                    done = True  # 结束标记之后是 Gutenberg 许可证全文，不用再看后面的文件

                soup = BeautifulSoup(doc, "lxml")
                for p in soup.find_all("p"):
                    text = clean_text(render_inline(p))
                    if not text:
                        continue

                    if self._chapter_heading_re.match(text):
                        flush()
                        chapter_num += 1
                        current_title = text
                        current_paragraphs = []
                        continue

                    current_paragraphs.append(Paragraph(kind=ParagraphKind.text, text=text))

        flush()
        return subsections

    def extract_section_headings(self, source_paths: List[str]) -> List[dict]:
        """跟 EpubAdapter 一样：这类小说只有"章"这一级 section_path，章
        本身就是叶子，没有更高层级需要额外的 SectionHeading 行。"""
        return []
