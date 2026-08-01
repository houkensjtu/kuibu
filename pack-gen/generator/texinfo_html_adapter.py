"""
解析 texinfo（GNU texi2any）生成的 HTML——SICP 的官方文本正是这样生成的，
sarabander 维护的 Unofficial Texinfo Format 版本在 mitpress.mit.edu 原版的
基础上重新跑了一遍 texi2any，DOM 结构和真正的官方版本一致。

结构小抄（跑一次 BeautifulSoup 就能验证）：
- 一个 <section> 里，<h3 class="section">（如 1.1）和 <h4 class="subsection">
  （如 1.1.1）之后跟着的 <p>/<ul>/<div class="lisp|example"> 都是平级兄弟节点，
  不是嵌套在标题里面的。
- <div class="lisp"> 和 <div class="example"> 都包一个 <pre>，是必须逐字保留的
  代码/示意图（ASCII 对齐图也在 example 里，同样对空白敏感）。
- <div class="footnote"> 是脚注定义，<h4 class="footnotes-heading"> 之后是脚注区
  ——都不算正文，直接跳过。
- 每章还有一个独立的"引言"文件（如 Chapter-1.xhtml），结构不一样：顶层是
  <h2 class="chapter">（chapnum/chaptitle span，不是 secnum/sectitle），
  没有编号小节，只有零个或多个 <h5 class="subsubheading">（纯文本，无
  编号）充当"引言内部的分段标题"，比如 SICP 第一章引言里的"Programming
  in Lisp"。这部分内容（Locke 引文、"sorcerer's apprentice"那段essay、
  Lisp 历史）之前完全没被抓取——只处理了 1.1/1.2/1.3 这些编号小节的文件，
  引言文件根本没拿来解析过。用 "{chapter_num}.0.{i}" 这种人为编号（i 从 1
  开始，每遇到一个 subsubheading 就 +1）把引言内容也纳入 section_path 体系，
  排在 "{chapter_num}.1"（如 1.1）之前，保证阅读顺序仍然正确。
"""

import warnings
from typing import List, Optional

from bs4 import BeautifulSoup, Comment, NavigableString, Tag, XMLParsedAsHTMLWarning

from .source_adapter import Paragraph, ParagraphKind, Subsection

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

_INLINE_MARKDOWN = {
    "b": "**",
    "strong": "**",
    "i": "*",
    "em": "*",
    "code": "`",
    "var": "`",
    "samp": "`",
}


def _render_inline(node) -> str:
    # Comment 是 NavigableString 的子类，必须先排除，否则 texinfo 转换过程
    # 遗留的 <!-- /@w --> 这类内部标记（"@w" 是"不要在此换行"指令）会被当成
    # 可见文本混进正文，产生 "For example /@w :" 这种明显的乱码。
    if isinstance(node, Comment):
        return ""
    if isinstance(node, NavigableString):
        return str(node)
    if not isinstance(node, Tag):
        return ""
    if node.name == "sup":
        return ""  # 脚注引用标记，不属于正文
    marker = _INLINE_MARKDOWN.get(node.name, "")
    inner = "".join(_render_inline(child) for child in node.children)
    return f"{marker}{inner}{marker}" if marker else inner


def _clean_text(raw: str) -> str:
    return " ".join(raw.split())


def _extract_verbatim_text(node) -> str:
    """代码块专用：只拼接字面文本，不做任何 markdown 装饰（_render_inline 会给
    <i> 包上 *斜体*，但代码块里的 <i> 是排版意义上的求值结果，不是强调）,
    同样要排除 Comment 节点。"""
    if isinstance(node, Comment):
        return ""
    if isinstance(node, NavigableString):
        return str(node)
    if not isinstance(node, Tag):
        return ""
    return "".join(_extract_verbatim_text(child) for child in node.children)


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

    if el.name == "div":
        classes = el.get("class") or []
        if "footnote" in classes:
            return []  # 脚注定义，跳过
        if "lisp" in classes or "example" in classes:
            pre = el.find("pre")
            if pre is None:
                return []
            code_text = _extract_verbatim_text(pre)
            return [Paragraph(kind=ParagraphKind.code, text=code_text)] if code_text.strip() else []

    if el.name == "blockquote":
        # texinfo 把 @quotation 之类的块渲染成 <blockquote>，里面可以包好几个
        # <p>/<ol> 子元素（比如"求值规则"那段：一个说明段落 + 一个步骤列表）。
        # 之前只在 <section> 顶层认 p/ul/ol/div，blockquote 整个被当成"不认识
        # 的标签"跳过，把里面的内容全丢了——递归展开它的每个子元素。
        paragraphs: List[Paragraph] = []
        for child in el.find_all(recursive=False):
            if isinstance(child, Tag):
                paragraphs.extend(_paragraphs_from_element(child))
        return paragraphs

    return []  # nav 等其他标签，不属于正文


class TexinfoHtmlAdapter:
    def parse(self, source_paths: List[str]) -> List[Subsection]:
        result: List[Subsection] = []
        for path in source_paths:
            result.extend(self._parse_file(path))
        return result

    def extract_section_headings(self, source_paths: List[str]) -> List[dict]:
        """
        每个源文件顶层只有一个章标题（<h2 class="chapter">）或一个节标题
        （<h3 class="section">），机械提取即可，不需要 LLM——跟 block 的正文
        不一样，这里没有"切分粒度"的问题，一个文件正好对应一条 heading。
        章节引言文件（Chapter-1.xhtml）只贡献章一级的 heading，不贡献节级的
        （它没有编号小节）。
        """
        headings: List[dict] = []
        for path in source_paths:
            with open(path, encoding="utf-8") as f:
                soup = BeautifulSoup(f.read(), "lxml")
            section_el = soup.body.find("section")

            section_h3 = section_el.find("h3", class_="section")
            if section_h3 is not None:
                secnum = _clean_text(_render_inline(section_h3.find("span", class_="secnum")))
                sectitle = _clean_text(_render_inline(section_h3.find("span", class_="sectitle")))
                chapter_num = secnum.split(".")[0]
                headings.append({"path": [chapter_num, secnum], "title": sectitle})
                continue

            chapter_h2 = section_el.find("h2", class_="chapter")
            if chapter_h2 is not None:
                chapnum = _clean_text(_render_inline(chapter_h2.find("span", class_="chapnum")))
                chaptitle = _clean_text(_render_inline(chapter_h2.find("span", class_="chaptitle")))
                headings.append({"path": [chapnum], "title": chaptitle})
                continue

            raise ValueError(
                f"{path}: 既没找到 <h3 class=\"section\"> 也没找到 <h2 class=\"chapter\">，"
                "不认识这个文件的结构"
            )
        return headings

    def _parse_file(self, path: str) -> List[Subsection]:
        with open(path, encoding="utf-8") as f:
            soup = BeautifulSoup(f.read(), "lxml")

        section_el = soup.body.find("section")

        section_h3 = section_el.find("h3", class_="section")
        if section_h3 is not None:
            return self._parse_numbered_section(section_el, section_h3)

        chapter_h2 = section_el.find("h2", class_="chapter")
        if chapter_h2 is not None:
            return self._parse_chapter_intro(section_el, chapter_h2)

        raise ValueError(
            f"{path}: 既没找到 <h3 class=\"section\"> 也没找到 <h2 class=\"chapter\">，"
            "不认识这个文件的结构"
        )

    def _parse_chapter_intro(self, section_el: Tag, chapter_h2: Tag) -> List[Subsection]:
        chapter_num = _clean_text(_render_inline(chapter_h2.find("span", class_="chapnum")))
        chapter_title = _clean_text(_render_inline(chapter_h2.find("span", class_="chaptitle")))
        fake_section_num = f"{chapter_num}.0"

        subsections: List[Subsection] = []
        sub_index = 1
        current_path = [chapter_num, fake_section_num, f"{fake_section_num}.{sub_index}"]
        current_title = chapter_title
        current_paragraphs: List[Paragraph] = []

        def flush() -> None:
            if current_paragraphs:
                subsections.append(
                    Subsection(
                        section_path=current_path,
                        section_title=current_title,
                        paragraphs=current_paragraphs,
                    )
                )

        for el in section_el.find_all(recursive=False):
            if not isinstance(el, Tag):
                continue

            classes = el.get("class") or []
            if el.name == "h2" and "chapter" in classes:
                continue  # 已经在上面读过 chapnum/chaptitle 了

            if "subsubheading" in classes:
                flush()
                sub_index += 1
                current_path = [chapter_num, fake_section_num, f"{fake_section_num}.{sub_index}"]
                current_title = _clean_text(_render_inline(el))
                current_paragraphs = []
                continue

            if el.name == "h4" and "footnotes-heading" in classes:
                break  # 正文结束，后面是脚注区

            current_paragraphs.extend(_paragraphs_from_element(el))

        flush()
        return subsections

    def _parse_numbered_section(self, section_el: Tag, section_h3: Tag) -> List[Subsection]:
        section_num = _clean_text(_render_inline(section_h3.find("span", class_="secnum")))
        chapter_num = section_num.split(".")[0]

        subsections: List[Subsection] = []
        intro_paragraphs: List[Paragraph] = []
        current_path: Optional[List[str]] = None
        current_title: Optional[str] = None
        current_paragraphs: List[Paragraph] = []
        started_first_subsection = False

        def flush() -> None:
            if current_path is not None:
                subsections.append(
                    Subsection(
                        section_path=current_path,
                        section_title=current_title or "",
                        paragraphs=current_paragraphs,
                    )
                )

        for el in section_el.find_all(recursive=False):
            if not isinstance(el, Tag):
                continue

            classes = el.get("class") or []
            if el.name == "h4" and "subsection" in classes:
                flush()
                # 用 _render_inline + _clean_text 而不是 get_text(strip=True)：
                # strip=True 会分别清掉每个子文本片段两端的空白再拼接，标题里
                # "Using <code>Lambda</code>" 这种"纯文本后紧跟着一个内联标签"
                # 的写法会因此丢掉中间那个空格，变成 "UsingLambda"。
                secnum = _clean_text(_render_inline(el.find("span", class_="secnum")))
                sectitle = _clean_text(_render_inline(el.find("span", class_="sectitle")))
                current_path = [chapter_num, section_num, secnum]
                current_title = sectitle
                # 章节标题和第一个小节标题之间的引言段落，并入第一个小节
                current_paragraphs = intro_paragraphs if not started_first_subsection else []
                started_first_subsection = True
                continue

            if el.name == "h4" and "footnotes-heading" in classes:
                break  # 正文结束，后面是脚注区

            new_paragraphs = _paragraphs_from_element(el)
            if not new_paragraphs:
                continue

            if current_path is None:
                intro_paragraphs.extend(new_paragraphs)
            else:
                current_paragraphs.extend(new_paragraphs)

        flush()
        return subsections
