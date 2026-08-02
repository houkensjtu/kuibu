import zipfile
from pathlib import Path

import pytest

from generator.epub_adapter import EpubAdapter
from generator.source_adapter import ParagraphKind

CONTAINER_XML = """<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

CONTENT_OPF = """<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <manifest>
    <item id="header" href="header.xhtml" media-type="application/xhtml+xml"/>
    <item id="footer" href="footer.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="header"/>
    <itemref idref="footer"/>
  </spine>
</package>
"""

# 模拟真实 Gatsby epub 里观察到的结构（DESIGN.md §14.3）：页眉样板文本混在
# 跟章节同一个文件里；一章带 <hr/> 场景分隔符；另一章带诗体引文（<br/> 分行 +
# <cite> 落款）、嵌套 <p> 的列表项、以及一个表格。
HEADER_XHTML = """<?xml version="1.0" encoding="utf-8"?>
<html><body>
<header><p>The Project Gutenberg eBook boilerplate, not real content.</p></header>
<div id="chapter-1">
<h2>I</h2>
<p>First paragraph of chapter one.</p>
<hr/>
<p>Second scene of chapter one.</p>
</div>
<div id="chapter-2">
<h2>II</h2>
<blockquote class="verse"><div>
<p><span>Then wear the gold hat<!-- /@w -->,</span><br/><span>if that will move her;</span></p>
<p><cite>Some Poet</cite></p>
</div></blockquote>
<p>Regular narration with <i>emphasis</i> and <b>bold</b>.</p>
<ul>
<li>plain item</li>
<li><p>item wrapped in p</p></li>
</ul>
<table><tbody>
<tr><td>Rise from bed</td><td>6:00</td></tr>
<tr><td>Study</td><td>7:15</td></tr>
</tbody></table>
</div>
</body></html>
"""

FOOTER_XHTML = """<?xml version="1.0" encoding="utf-8"?>
<html><body>
<footer><p>END OF THE PROJECT GUTENBERG EBOOK - pure boilerplate, no chapter div here.</p></footer>
</body></html>
"""


@pytest.fixture
def fixture_epub_path(tmp_path: Path) -> str:
    epub_path = tmp_path / "fixture.epub"
    with zipfile.ZipFile(epub_path, "w") as zf:
        zf.writestr("mimetype", "application/epub+zip")
        zf.writestr("META-INF/container.xml", CONTAINER_XML)
        zf.writestr("OEBPS/content.opf", CONTENT_OPF)
        zf.writestr("OEBPS/header.xhtml", HEADER_XHTML)
        zf.writestr("OEBPS/footer.xhtml", FOOTER_XHTML)
    return str(epub_path)


def test_finds_chapters_in_spine_order_and_skips_files_with_no_chapter_div(fixture_epub_path):
    subsections = EpubAdapter().parse([fixture_epub_path])
    assert [s.section_path for s in subsections] == [["1"], ["2"]]


def test_chapter_number_comes_from_div_id_not_heading_text(fixture_epub_path):
    subsections = EpubAdapter().parse([fixture_epub_path])
    assert subsections[0].section_path == ["1"]
    assert subsections[0].section_title == "I"
    assert subsections[1].section_path == ["2"]
    assert subsections[1].section_title == "II"


def test_header_boilerplate_outside_chapter_divs_is_excluded(fixture_epub_path):
    subsections = EpubAdapter().parse([fixture_epub_path])
    all_text = " ".join(p.text for s in subsections for p in s.paragraphs)
    assert "boilerplate" not in all_text


def test_footer_file_with_no_chapter_div_contributes_nothing(fixture_epub_path):
    subsections = EpubAdapter().parse([fixture_epub_path])
    all_text = " ".join(p.text for s in subsections for p in s.paragraphs)
    assert "END OF THE PROJECT GUTENBERG EBOOK" not in all_text


def test_scene_break_hr_becomes_an_explicit_marker_paragraph(fixture_epub_path):
    subsections = EpubAdapter().parse([fixture_epub_path])
    texts = [p.text for p in subsections[0].paragraphs]
    assert texts == [
        "First paragraph of chapter one.",
        "* * *",
        "Second scene of chapter one.",
    ]


def test_verse_blockquote_preserves_line_breaks_and_strips_html_comments(fixture_epub_path):
    subsections = EpubAdapter().parse([fixture_epub_path])
    texts = [p.text for p in subsections[1].paragraphs]
    assert "Then wear the gold hat,\nif that will move her;" in texts
    assert "/@w" not in " ".join(texts)


def test_verse_attribution_cite_becomes_italic_markdown(fixture_epub_path):
    subsections = EpubAdapter().parse([fixture_epub_path])
    texts = [p.text for p in subsections[1].paragraphs]
    assert "*Some Poet*" in texts


def test_inline_emphasis_and_bold_become_markdown(fixture_epub_path):
    subsections = EpubAdapter().parse([fixture_epub_path])
    texts = [p.text for p in subsections[1].paragraphs]
    assert "Regular narration with *emphasis* and **bold**." in texts


def test_list_items_handle_both_plain_and_p_wrapped_li(fixture_epub_path):
    subsections = EpubAdapter().parse([fixture_epub_path])
    texts = [p.text for p in subsections[1].paragraphs]
    assert "- plain item\n- item wrapped in p" in texts


def test_table_rows_become_one_paragraph_with_tab_separated_cells(fixture_epub_path):
    subsections = EpubAdapter().parse([fixture_epub_path])
    texts = [p.text for p in subsections[1].paragraphs]
    assert "Rise from bed  6:00\nStudy  7:15" in texts


def test_all_paragraphs_are_text_kind_never_code(fixture_epub_path):
    # 小说没有 SICP 那种必须逐字保留的代码块，全部内容都应该是 text 段落。
    subsections = EpubAdapter().parse([fixture_epub_path])
    kinds = {p.kind for s in subsections for p in s.paragraphs}
    assert kinds == {ParagraphKind.text}


def test_extract_section_headings_is_empty_for_single_level_novels(fixture_epub_path):
    # 小说只有"章"一级 section_path，没有更高层级需要额外的 heading 行
    # ——空列表是正确答案，不是没实现。
    assert EpubAdapter().extract_section_headings([fixture_epub_path]) == []


class TestAgainstRealGatsbyEpub:
    """对照真实下载的 Project Gutenberg epub 做一次冒烟测试，不只是合成
    fixture——DESIGN.md §14.3 的解析策略是照着这份真实文件的结构写的。"""

    @pytest.fixture
    def real_epub_path(self) -> str:
        path = Path(__file__).parent.parent / "sources" / "gatsby" / "gatsby.epub"
        if not path.exists():
            pytest.skip("real Gatsby epub not present at pack-gen/sources/gatsby/gatsby.epub")
        return str(path)

    def test_finds_all_nine_chapters_in_order(self, real_epub_path):
        subsections = EpubAdapter().parse([real_epub_path])
        assert [s.section_path for s in subsections] == [[str(n)] for n in range(1, 10)]
        assert [s.section_title for s in subsections] == [
            "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX",
        ]

    def test_chapter_one_opens_with_the_known_first_line(self, real_epub_path):
        subsections = EpubAdapter().parse([real_epub_path])
        first_paragraph = subsections[0].paragraphs[0].text
        assert "In my younger and more vulnerable years" in first_paragraph

    def test_no_gutenberg_boilerplate_leaks_into_any_chapter(self, real_epub_path):
        subsections = EpubAdapter().parse([real_epub_path])
        all_text = " ".join(p.text for s in subsections for p in s.paragraphs)
        assert "PROJECT GUTENBERG" not in all_text.upper()
