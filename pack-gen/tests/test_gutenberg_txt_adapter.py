import re
import zipfile
from pathlib import Path

import pytest

from generator.gutenberg_txt_adapter import GutenbergTxtAdapter
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
    <item id="body" href="body.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="body"/>
  </spine>
</package>
"""

# 模拟真实西游记 epub 里观察到的结构（见模块 docstring）：样板文本跟正文
# 混在同一个文件里，章节标题是孤立的 <p>，没有任何容器包装；一个章节数字
# 用标准数字，一个用逐位读数，一个用"○"代替十位的零——都要能正确识别。
BODY_XHTML = """<?xml version="1.0" encoding="utf-8"?>
<html><body>
<p>Some Gutenberg header boilerplate before the marker.</p>
<span>*** START OF THE PROJECT GUTENBERG EBOOK 測試 ***</span>
<p style="margin-top: 8em">第一回     標題甲　標題乙</p>
<p>正文第一段，講述故事的開端。</p>
<p>正文第二段，繼續講述。詩曰：<br/>
    這是第一行詩句<br/>
    這是第二行詩句</p>
<p style="margin-top: 5em">第一二回     標題丙　標題丁</p>
<p>這是第一二回的正文，不是標題，不應該再被誤判成新章節。</p>
<p style="margin-top: 5em">第二○回     標題戊　標題己</p>
<p>這是第二○回的正文。</p>
<span>*** END OF THE PROJECT GUTENBERG EBOOK 測試 ***</span>
<p>Gutenberg license boilerplate after the marker - must not appear anywhere.</p>
</body></html>
"""


@pytest.fixture
def fixture_epub_path(tmp_path: Path) -> str:
    epub_path = tmp_path / "fixture.epub"
    with zipfile.ZipFile(epub_path, "w") as zf:
        zf.writestr("mimetype", "application/epub+zip")
        zf.writestr("META-INF/container.xml", CONTAINER_XML)
        zf.writestr("OEBPS/content.opf", CONTENT_OPF)
        zf.writestr("OEBPS/body.xhtml", BODY_XHTML)
    return str(epub_path)


CHAPTER_RE = re.compile(r"^第[一二三四五六七八九十百零○]+回")


@pytest.fixture
def adapter() -> GutenbergTxtAdapter:
    return GutenbergTxtAdapter(
        chapter_heading_re=CHAPTER_RE,
        start_marker="START OF THE PROJECT GUTENBERG EBOOK",
        end_marker="END OF THE PROJECT GUTENBERG EBOOK",
    )


def test_finds_three_chapters_in_order(adapter, fixture_epub_path):
    subsections = adapter.parse([fixture_epub_path])
    assert [s.section_path for s in subsections] == [["1"], ["2"], ["3"]]


def test_section_path_is_sequential_not_parsed_from_heading_text(adapter, fixture_epub_path):
    # 第一二回（用逐位读数写的"十二"）应该被编成第 2 个章节，不是被解析成
    # "12" 之类的字面值——这正是不信任原文数字写法这条设计决策要验证的地方。
    subsections = adapter.parse([fixture_epub_path])
    assert subsections[1].section_path == ["2"]
    assert subsections[1].section_title == "第一二回 標題丙 標題丁"


def test_full_width_zero_circle_is_recognized_as_a_chapter_heading(adapter, fixture_epub_path):
    # "第二○回" 用 ○ 代替十位的零，不是常见的"零"字——真实源文件里这个
    # 写法漏掉过一次，专门写一个回归测试盯住它。
    subsections = adapter.parse([fixture_epub_path])
    assert subsections[2].section_path == ["3"]
    assert subsections[2].section_title == "第二○回 標題戊 標題己"


def test_content_before_start_marker_is_excluded(adapter, fixture_epub_path):
    subsections = adapter.parse([fixture_epub_path])
    all_text = " ".join(p.text for s in subsections for p in s.paragraphs)
    assert "boilerplate before the marker" not in all_text


def test_content_after_end_marker_is_excluded(adapter, fixture_epub_path):
    subsections = adapter.parse([fixture_epub_path])
    all_text = " ".join(p.text for s in subsections for p in s.paragraphs)
    assert "license boilerplate after the marker" not in all_text


def test_br_separated_verse_within_a_paragraph_preserves_line_breaks(adapter, fixture_epub_path):
    subsections = adapter.parse([fixture_epub_path])
    texts = [p.text for p in subsections[0].paragraphs]
    assert "這是第一行詩句\n這是第二行詩句" in "\n".join(texts)


def test_all_paragraphs_are_text_kind_never_code(adapter, fixture_epub_path):
    subsections = adapter.parse([fixture_epub_path])
    kinds = {p.kind for s in subsections for p in s.paragraphs}
    assert kinds == {ParagraphKind.text}


def test_extract_section_headings_is_empty(adapter, fixture_epub_path):
    assert adapter.extract_section_headings([fixture_epub_path]) == []


class TestAgainstRealXiyoujiEpub:
    """对照真实下载的 Project Gutenberg 西游记 epub 做冒烟测试——设计是照着
    这份真实文件的结构写的（章节数字写法不统一、有"○"符号），不是拍脑袋。"""

    @pytest.fixture
    def real_epub_path(self) -> str:
        path = Path(__file__).parent.parent / "sources" / "xiyouji" / "xiyouji.epub"
        if not path.exists():
            pytest.skip("real 西游记 epub not present at pack-gen/sources/xiyouji/xiyouji.epub")
        return str(path)

    def test_finds_100_chapters(self, real_epub_path):
        subsections = adapter_for_real().parse([real_epub_path])
        assert len(subsections) == 100
        assert [s.section_path for s in subsections] == [[str(n)] for n in range(1, 101)]

    def test_chapter_one_opens_with_the_known_first_line(self, real_epub_path):
        subsections = adapter_for_real().parse([real_epub_path])
        first_paragraph = subsections[0].paragraphs[0].text
        assert "混沌未分天地亂" in first_paragraph

    def test_no_gutenberg_license_text_leaks_into_any_chapter(self, real_epub_path):
        subsections = adapter_for_real().parse([real_epub_path])
        all_text = " ".join(p.text for s in subsections for p in s.paragraphs)
        assert "PROJECT GUTENBERG" not in all_text.upper()


def adapter_for_real() -> GutenbergTxtAdapter:
    return GutenbergTxtAdapter(
        chapter_heading_re=re.compile(r"^第[一二三四五六七八九十百零○]+回"),
        start_marker="START OF THE PROJECT GUTENBERG EBOOK",
        end_marker="END OF THE PROJECT GUTENBERG EBOOK",
    )
