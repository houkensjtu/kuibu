import re
import zipfile
from pathlib import Path

import pytest

from generator.per_file_epub_adapter import PerFileEpubAdapter
from generator.source_adapter import ParagraphKind

CONTAINER_XML = """<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

# 模拟真实《史蒂夫·乔布斯传》epub 里观察到的结构：每个 spine 文件是独立的一
# "节"，标题是文件内唯一的 <h1>-<h6>，正文是平铺的 <p>；spine 顺序里
# chapter-b（对应"第二章"）排在 chapter-a（对应"第一章"）前面——文件名/manifest
# id 顺序不可信，必须按 spine 走，这是从真实文件里实测到的坑，专门写一个
# 顺序颠倒的 fixture 盯住它。非正文页（封面/标签页/致谢）跟正文页混在同一份
# spine 里，也要能正确跳过。
CONTENT_OPF = """<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <manifest>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="label" href="label.xhtml" media-type="application/xhtml+xml"/>
    <item id="foreword" href="foreword.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter-b" href="chapter-b.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter-a" href="chapter-a.xhtml" media-type="application/xhtml+xml"/>
    <item id="afterword" href="afterword.xhtml" media-type="application/xhtml+xml"/>
    <item id="thanks" href="thanks.xhtml" media-type="application/xhtml+xml"/>
    <item id="backcover" href="backcover.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="cover"/>
    <itemref idref="label"/>
    <itemref idref="foreword"/>
    <itemref idref="chapter-a"/>
    <itemref idref="chapter-b"/>
    <itemref idref="afterword"/>
    <itemref idref="thanks"/>
    <itemref idref="backcover"/>
  </spine>
</package>
"""

COVER_XHTML = """<?xml version="1.0" encoding="utf-8"?>
<html><body><div><h1>測試傳記</h1></div></body></html>
"""

LABEL_XHTML = """<?xml version="1.0" encoding="utf-8"?>
<html><body><div><h3>本書作者</h3><p>某某某</p></div></body></html>
"""

FOREWORD_XHTML = """<?xml version="1.0" encoding="utf-8"?>
<html><body><div><h3>序</h3><p>這是序言正文，講述本書是如何誕生的。</p></div></body></html>
"""

# manifest 里 chapter-b 排在 chapter-a 前面，但 <spine> 顺序是 a 先 b 后——
# 用来验证阅读顺序跟 <spine> 走，不是 <manifest> 里 <item> 出现的顺序（这两者
# 允许不一致，epub 规范本来就是这样定义 spine 的作用的）。
CHAPTER_A_XHTML = """<?xml version="1.0" encoding="utf-8"?>
<html><body><div><h3>第一章 甲的故事</h3>
<p>第一章的第一段。</p>
<p>第一章的第二段，詩曰：<br/>
    這是第一行詩句<br/>
    這是第二行詩句</p>
</div></body></html>
"""

CHAPTER_B_XHTML = """<?xml version="1.0" encoding="utf-8"?>
<html><body><div><h3>第二章 乙的故事</h3>
<p>第二章的第一段。</p>
</div></body></html>
"""

AFTERWORD_XHTML = """<?xml version="1.0" encoding="utf-8"?>
<html><body><div><h3>尾聲</h3><p>這是尾聲正文。</p></div></body></html>
"""

THANKS_XHTML = """<?xml version="1.0" encoding="utf-8"?>
<html><body><div><h3>致謝</h3><p>感謝名單，不應該被收錄。</p></div></body></html>
"""

# 封底页：只有一張圖，沒有任何標題標籤——必須整篇跳過而不是報錯。
BACKCOVER_XHTML = """<?xml version="1.0" encoding="utf-8"?>
<html><body><div><p><img alt="" src="../Images/back.jpg"/></p></div></body></html>
"""

CHAPTER_RE = re.compile(r"^第[一二三四五六七八九十]+章")


def _include_heading(title: str) -> bool:
    return bool(CHAPTER_RE.match(title)) or title in ("序", "尾聲")


@pytest.fixture
def fixture_epub_path(tmp_path: Path) -> str:
    epub_path = tmp_path / "fixture.epub"
    with zipfile.ZipFile(epub_path, "w") as zf:
        zf.writestr("mimetype", "application/epub+zip")
        zf.writestr("META-INF/container.xml", CONTAINER_XML)
        zf.writestr("OEBPS/content.opf", CONTENT_OPF)
        zf.writestr("OEBPS/cover.xhtml", COVER_XHTML)
        zf.writestr("OEBPS/label.xhtml", LABEL_XHTML)
        zf.writestr("OEBPS/foreword.xhtml", FOREWORD_XHTML)
        zf.writestr("OEBPS/chapter-a.xhtml", CHAPTER_A_XHTML)
        zf.writestr("OEBPS/chapter-b.xhtml", CHAPTER_B_XHTML)
        zf.writestr("OEBPS/afterword.xhtml", AFTERWORD_XHTML)
        zf.writestr("OEBPS/thanks.xhtml", THANKS_XHTML)
        zf.writestr("OEBPS/backcover.xhtml", BACKCOVER_XHTML)
    return str(epub_path)


@pytest.fixture
def adapter() -> PerFileEpubAdapter:
    return PerFileEpubAdapter(include_heading=_include_heading)


def test_finds_four_included_sections_in_spine_order(adapter, fixture_epub_path):
    subsections = adapter.parse([fixture_epub_path])
    assert [s.section_title for s in subsections] == ["序", "第一章 甲的故事", "第二章 乙的故事", "尾聲"]


def test_section_path_is_sequential_by_spine_order_not_filename(adapter, fixture_epub_path):
    # chapter-a.xhtml 文件名在 chapter-b.xhtml 之前，但 spine 顺序里
    # chapter-a（内容是"第二章"）排在 chapter-b（内容是"第一章"）后面——
    # section_path 必须跟 spine 走，验证的就是这个真实踩过的坑。
    subsections = adapter.parse([fixture_epub_path])
    assert [s.section_path for s in subsections] == [["1"], ["2"], ["3"], ["4"]]
    assert subsections[1].section_title == "第一章 甲的故事"
    assert subsections[2].section_title == "第二章 乙的故事"


def test_cover_label_thanks_and_backcover_are_excluded(adapter, fixture_epub_path):
    subsections = adapter.parse([fixture_epub_path])
    all_titles = [s.section_title for s in subsections]
    assert "測試傳記" not in all_titles
    assert "本書作者" not in all_titles
    assert "致謝" not in all_titles


def test_file_with_no_heading_tag_is_skipped_without_error(adapter, fixture_epub_path):
    # backcover.xhtml 完全没有 h1-h6，不应该让整个解析报错。
    subsections = adapter.parse([fixture_epub_path])
    assert all(s.section_title != "" for s in subsections)


def test_br_separated_verse_within_a_paragraph_preserves_line_breaks(adapter, fixture_epub_path):
    chapter_one = next(s for s in subsections_by_title(adapter, fixture_epub_path) if s.section_title == "第一章 甲的故事")
    texts = "\n".join(p.text for p in chapter_one.paragraphs)
    assert "這是第一行詩句\n這是第二行詩句" in texts


def test_all_paragraphs_are_text_kind_never_code(adapter, fixture_epub_path):
    subsections = adapter.parse([fixture_epub_path])
    kinds = {p.kind for s in subsections for p in s.paragraphs}
    assert kinds == {ParagraphKind.text}


def test_extract_section_headings_is_empty(adapter, fixture_epub_path):
    assert adapter.extract_section_headings([fixture_epub_path]) == []


def subsections_by_title(adapter, fixture_epub_path):
    return adapter.parse([fixture_epub_path])


class TestAgainstRealSjobsEpub:
    """对照真实的《史蒂夫·乔布斯传》epub 做冒烟测试——设计是照着这份真实文件
    的结构写的（spine 顺序颠倒、每章独立文件）。这份 epub 是私有内容
    （pack-gen/sources/private/sjobs/，见 .gitignore），不在其他人机器上，
    没有这个文件时自动跳过，不影响其他人跑测试套件。"""

    @pytest.fixture
    def real_epub_path(self) -> str:
        path = Path(__file__).parent.parent / "sources" / "private" / "sjobs" / "乔布斯传.epub"
        if not path.exists():
            pytest.skip("real 乔布斯传 epub not present at pack-gen/sources/private/sjobs/乔布斯传.epub")
        return str(path)

    def test_finds_forward_forty_one_chapters_and_afterword(self, real_epub_path):
        subsections = adapter_for_real().parse([real_epub_path])
        assert len(subsections) == 43
        assert [s.section_path for s in subsections] == [[str(n)] for n in range(1, 44)]
        assert subsections[0].section_title == "前言 本书是如何诞生的"
        assert subsections[1].section_title == "第一章 童年"
        assert subsections[-2].section_title == "第四十一章 遗产"
        assert subsections[-1].section_title == "尾声"

    def test_documents_the_known_spine_authoring_bug(self, real_epub_path):
        # 真实 epub 的 <spine> 本身就把 chapter32.html（第二十六章）排在
        # chapter31.html（第二十五章）前面——这是源文件自己的一个真实错误
        # （content.opf 里留着"Your OPF file was broken so Sigil was forced
        # to create a new one from scratch"这条注释，大概率是那次重建时手误
        # 调换了两条 itemref），不是我们的解析逻辑搞反的。adapter 忠实反映
        # spine 声明的顺序，不在这一层悄悄"纠正"语义顺序——纠正放在
        # split_sjobs.py（校对完整本书顺序后一次性重排），这条测试锁定的是
        # "adapter 本身诚实反映 spine，不做隐藏纠正"这个契约，纠正逻辑另有
        # test_split_sjobs.py 单独验证。
        subsections = adapter_for_real().parse([real_epub_path])
        titles = [s.section_title for s in subsections]
        assert titles.index("第二十六章 iMac") < titles.index("第二十五章 设计原则")

    def test_no_front_or_back_matter_labels_leak_in(self, real_epub_path):
        subsections = adapter_for_real().parse([real_epub_path])
        titles = {s.section_title for s in subsections}
        assert titles.isdisjoint({"本书作者", "史蒂夫·乔布斯唯一授权传记", "题记", "主要人物", "致谢", "摄影集"})


def adapter_for_real() -> PerFileEpubAdapter:
    chapter_re = re.compile(r"^第[一二三四五六七八九十百]+章")
    return PerFileEpubAdapter(
        include_heading=lambda title: bool(chapter_re.match(title)) or title in ("前言 本书是如何诞生的", "尾声"),
    )
