"""
核对 llm-output/<section>.json 里每道题的 explanation 是否真的逐字引用了这一节
自己的原文——不是靠 subagent 自我声明"已核对"，而是机械地把 explanation 里
"原文："后面引号内的每一段（用"……"分隔多段非连续引用）都去做子串匹配。

背景：西游记 M3 验收时发现约一半"逐字引用"其实是意译后加了引号，subagent
在各自的完成报告里都声称核对过，但没人真的做过字节级比对（见 CLAUDE.md
"踩过的坑"）。这次乔布斯传全书铺开体量是西游记的 4-5 倍，规模更大、更该在
合并前先机械查一遍，而不是事后人工抽查。

用法：
    cd pack-gen
    python scripts/verify_explanation_quotes.py [section_name ...]
不传参数时检查 llm-output/ 目录下现有的全部节。
"""

import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

SECTIONS_DIR = Path("build/private/sjobs/sections")
LLM_OUTPUT_DIR = Path("build/private/sjobs/llm-output")

# 不锚定"原文："前缀——多数 explanation 是纯"原文："“…”""一整句引用，但也有
# 混合叙述体（先复述一句上下文，再嵌入一小段"…"逐字引用）合法存在，两种风格
# 都该查：只要出现在“ ”里的内容，就该是原文子串，不管前面有没有"原文："。
QUOTE_PATTERN = re.compile(r"“(.+?)”", re.DOTALL)


# 原文里中文人名/地名/书名后面常常紧跟一个西文原名括注，如"阿兰·图灵(Alan·Turing)"
# 或"《48小时》(48 Hours)"——引用时按惯例会省去这个括注，这不是意译（没有换词/
# 换序），核对时要把源文里这类括注当成透明的、允许被省略的部分。起始字符允许
# 数字（书名/机构名括注常以数字开头，如"(48 Hours)"），只匹配西文/数字括注，
# 不动中文括注（后者更可能是作者原本就有意义的插入语，省略了才是真正的信息
# 丢失）。
LATIN_GLOSS_PATTERN = re.compile(r"[（(][A-Za-z0-9][A-Za-z0-9·.&'\- ]*[）)]")


def normalize(s: str) -> str:
    """去掉空白/换行差异，把引号内嵌套引号统一成外层引号的写法——explanation
    的约定是外层用“ ”包住整句"原文："引用，原文里本来就带的双引号对话为了不
    跟外层冲突会被手工换成单引号‘ ’，这是合法的书写约定，不是意译，比对时要
    把两种引号视为等价，否则会把这类合法转写误报成"不是原文子串"。"""
    s = re.sub(r"\s+", "", s)
    return s.replace("‘", "“").replace("’", "”")


def load_section_text(name: str) -> str:
    section = json.loads((SECTIONS_DIR / f"{name}.json").read_text(encoding="utf-8"))
    raw = "".join(p["text"] for p in section["paragraphs"])
    raw = LATIN_GLOSS_PATTERN.sub("", raw)
    return normalize(raw)


TRAILING_PUNCT = "。”’、，,."


def span_matches(span: str, section_text: str) -> bool:
    # 引用在语义完整的地方截断收尾时，习惯把原文的"，"/"——"改写成句号（可能
    # 还嵌套着内层引号的收尾符），这不是意译（没有换词/换序），只是截断点的
    # 标点换了——从右往左剥掉这类收尾标点后再按子串比对，不要求截断处之后的
    # 原文标点也一致。最多剥 3 个字符，避免把真正缺失的内容也剥没了。
    for cut in range(0, 4):
        candidate = span[: len(span) - cut] if cut else span
        if cut and (not candidate or span[len(candidate)] not in TRAILING_PUNCT):
            break
        if candidate and candidate in section_text:
            return True
    return False


def check_section(name: str) -> list[str]:
    llm_path = LLM_OUTPUT_DIR / f"{name}.json"
    if not llm_path.exists():
        return [f"{name}: llm-output 不存在，跳过"]

    section_text = load_section_text(name)
    llm_output = json.loads(llm_path.read_text(encoding="utf-8"))

    problems = []
    for qi, q in enumerate(llm_output.get("questions", [])):
        explanation = q.get("explanation", "")
        quotes = QUOTE_PATTERN.findall(explanation)
        if not quotes:
            problems.append(f"{name} question[{qi}]: explanation 里没有“…”引用 -> {explanation[:60]!r}")
            continue

        for gi, quoted in enumerate(quotes):
            spans = [s for s in quoted.split("……") if s.strip()]
            for si, span in enumerate(spans):
                if not span_matches(normalize(span), section_text):
                    problems.append(
                        f"{name} question[{qi}] quote[{gi}] span[{si}]: 不是原文子串 -> {span[:50]!r}"
                    )
    return problems


def main() -> None:
    args = sys.argv[1:]
    if args:
        names = args
    else:
        names = sorted(p.stem for p in LLM_OUTPUT_DIR.glob("*.json"))

    all_problems = []
    for name in names:
        problems = check_section(name)
        if problems:
            all_problems.extend(problems)
        else:
            print(f"  {name}: OK")

    if all_problems:
        print(f"\n{len(all_problems)} 处问题：")
        for p in all_problems:
            print(f"  ✗ {p}")
        sys.exit(1)
    else:
        print(f"\n全部 {len(names)} 节的 explanation 引用核对通过。")


if __name__ == "__main__":
    main()
