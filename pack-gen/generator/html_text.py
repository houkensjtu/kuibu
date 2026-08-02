"""
把一个 BeautifulSoup 内联节点渲染成带 markdown 强调标记的纯文本，`<br/>`
转成换行——Gatsby 的诗体引文和西游记正文里穿插的诗词都靠这份逻辑处理
（同一段 `<p>` 里散文叙述和 `<br/>` 分行的诗句混在一起，不是分开的两种
元素），从 `epub_adapter.py` 抽出来给两边共用，避免各写一份几乎相同的
空白处理逻辑（尤其是"不能把换行也压成空格，得逐行清理"这条容易漏掉的
细节，见 `_clean_text` 的注释）。
"""

import re

from bs4 import Comment, NavigableString, Tag

# epub 内部文本里常见的零宽格式字符（如 Gutenberg 排版用来防止数字范围被
# 换行截断的 U+2060 WORD JOINER），对阅读没有意义，清理掉避免终端里出现
# 看不见但占位的怪字符。
_ZERO_WIDTH_RE = re.compile("[​⁠﻿]")

INLINE_MARKDOWN = {
    "b": "**",
    "strong": "**",
    "i": "*",
    "em": "*",
    "cite": "*",
}


def render_inline(node) -> str:
    if isinstance(node, Comment):
        return ""
    if isinstance(node, NavigableString):
        return str(node)
    if not isinstance(node, Tag):
        return ""
    if node.name == "br":
        return "\n"
    if node.name == "sup":
        return ""  # 脚注引用标记，不属于正文
    marker = INLINE_MARKDOWN.get(node.name, "")
    inner = "".join(render_inline(child) for child in node.children)
    return f"{marker}{inner}{marker}" if marker else inner


def clean_text(raw: str) -> str:
    """不能直接把所有空白（含换行）压成一个空格——诗体引文靠 <br/> 产生的
    换行是有意义的分行，必须保留，只清理每一行内部的空白。"""
    raw = _ZERO_WIDTH_RE.sub("", raw)
    lines = [" ".join(line.split()) for line in raw.split("\n")]
    return "\n".join(line for line in lines if line)
