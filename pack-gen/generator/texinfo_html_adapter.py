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


def _paragraph_from_element(el: Tag) -> Optional[Paragraph]:
    if el.name == "p":
        text = _clean_text(_render_inline(el))
        return Paragraph(kind=ParagraphKind.text, text=text) if text else None

    if el.name in ("ul", "ol"):
        lines = []
        for li in el.find_all("li", recursive=False):
            text = _clean_text(_render_inline(li))
            if text:
                lines.append(f"- {text}")
        return Paragraph(kind=ParagraphKind.text, text="\n".join(lines)) if lines else None

    if el.name == "div":
        classes = el.get("class") or []
        if "footnote" in classes:
            return None  # 脚注定义，跳过
        if "lisp" in classes or "example" in classes:
            pre = el.find("pre")
            if pre is None:
                return None
            code_text = _extract_verbatim_text(pre)
            return Paragraph(kind=ParagraphKind.code, text=code_text) if code_text.strip() else None

    return None  # nav、blockquote 等其他标签，不属于正文


class TexinfoHtmlAdapter:
    def parse(self, source_paths: List[str]) -> List[Subsection]:
        result: List[Subsection] = []
        for path in source_paths:
            result.extend(self._parse_file(path))
        return result

    def _parse_file(self, path: str) -> List[Subsection]:
        with open(path, encoding="utf-8") as f:
            soup = BeautifulSoup(f.read(), "lxml")

        section_el = soup.body.find("section")
        section_h3 = section_el.find("h3", class_="section")
        section_num = section_h3.find("span", class_="secnum").get_text(strip=True)
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

            paragraph = _paragraph_from_element(el)
            if paragraph is None:
                continue

            if current_path is None:
                intro_paragraphs.append(paragraph)
            else:
                current_paragraphs.append(paragraph)

        flush()
        return subsections
