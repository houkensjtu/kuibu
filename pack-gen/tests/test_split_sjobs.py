from generator.source_adapter import Subsection
from scripts.split_sjobs import (
    _chapter_number,
    _parse_chinese_number,
    include_heading,
    reorder_and_renumber,
)


def test_parses_single_digit():
    assert _parse_chinese_number("五") == 5


def test_parses_ten_exactly():
    assert _parse_chinese_number("十") == 10


def test_parses_teens():
    assert _parse_chinese_number("十五") == 15


def test_parses_round_tens():
    assert _parse_chinese_number("四十") == 40


def test_parses_compound_tens():
    assert _parse_chinese_number("二十六") == 26
    assert _parse_chinese_number("四十一") == 41


def test_chapter_number_extracts_from_full_heading():
    assert _chapter_number("第二十六章 iMac") == 26


def test_chapter_number_is_none_for_non_chapter_headings():
    assert _chapter_number("前言 本书是如何诞生的") is None
    assert _chapter_number("尾声") is None


def test_include_heading_accepts_chapters_foreword_and_afterword():
    assert include_heading("第一章 童年")
    assert include_heading("前言 本书是如何诞生的")
    assert include_heading("尾声")


def test_include_heading_rejects_everything_else():
    assert not include_heading("本书作者")
    assert not include_heading("致谢")
    assert not include_heading("摄影集")


def _sub(title: str) -> Subsection:
    return Subsection(section_path=["0"], section_title=title, paragraphs=[])


def test_reorder_fixes_the_known_spine_swap():
    # 模拟真实 epub 里 spine 顺序：前言 -> ...第二十四章 -> 第二十六章
    # （swap 后先出现）-> 第二十五章 -> 第二十七章... -> 尾声
    raw = [
        _sub("前言 本书是如何诞生的"),
        _sub("第二十四章 非同凡想"),
        _sub("第二十六章 iMac"),
        _sub("第二十五章 设计原则"),
        _sub("第二十七章 CEO"),
        _sub("尾声"),
    ]
    corrected = reorder_and_renumber(raw)
    assert [s.section_title for s in corrected] == [
        "前言 本书是如何诞生的",
        "第二十四章 非同凡想",
        "第二十五章 设计原则",
        "第二十六章 iMac",
        "第二十七章 CEO",
        "尾声",
    ]


def test_reorder_renumbers_section_path_sequentially_after_sort():
    raw = [_sub("前言 本书是如何诞生的"), _sub("第二章 奇特的一对"), _sub("第一章 童年"), _sub("尾声")]
    corrected = reorder_and_renumber(raw)
    assert [s.section_path for s in corrected] == [["1"], ["2"], ["3"], ["4"]]


def test_reorder_is_a_no_op_when_already_in_order():
    raw = [_sub("前言 本书是如何诞生的"), _sub("第一章 童年"), _sub("第二章 奇特的一对"), _sub("尾声")]
    corrected = reorder_and_renumber(raw)
    assert [s.section_title for s in corrected] == [s.section_title for s in raw]
