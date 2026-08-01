from pathlib import Path

import pytest

from generator.source_adapter import ParagraphKind
from generator.texinfo_html_adapter import TexinfoHtmlAdapter

FIXTURE_HTML = """<?xml version="1.0" encoding="utf-8"?>
<html><body>
<section>
<h3 class="section"><span class="secnum">1.1</span><span class="sectitle">A Section</span></h3>
<p>Intro paragraph before any subsection.</p>
<h4 class="subsection"><span class="secnum">1.1.1</span><span class="sectitle">First <code>Sub</code></span></h4>
<p>First paragraph with <b>bold</b> and <i>italic</i> text.</p>
<p>numbers.  For example<!-- /@w -->: end of sentence.</p>
<ul>
<li>item one</li>
<li>item two</li>
</ul>
<div class="lisp"><pre class="lisp">(define (square x) (* x x))<!-- /@w --> <i>486</i></pre></div>
<blockquote>
<p>To evaluate a combination, do the following:</p>
<ol>
<li>Evaluate the subexpressions.</li>
<li>Apply the procedure.</li>
</ol>
</blockquote>
<div class="footnote"><p>this footnote definition should be skipped</p></div>
<h4 class="subsection"><span class="secnum">1.1.2</span><span class="sectitle">Second</span></h4>
<p>Second subsection paragraph.</p>
<div class="example"><pre class="example">  a   b
  |   |
</pre></div>
<h4 class="footnotes-heading">Footnotes</h4>
<p>this should never appear, it's past the footnotes heading</p>
</section>
</body></html>
"""


CHAPTER_INTRO_FIXTURE_HTML = """<?xml version="1.0" encoding="utf-8"?>
<html><body>
<section>
<h2 class="chapter"><span class="chapnum">1</span><span class="chaptitle">Building Abstractions with Procedures</span></h2>
<blockquote>
<p>The acts of the mind... three: 1. Combining<!-- /@w --> several simple ideas.</p>
<p>&#8212;John Locke, <cite>An Essay</cite> (1690)</p>
</blockquote>
<p>We are about to study the idea of a computational process.</p>
<h5 class="subsubheading">Programming in Lisp</h5>
<p>Lisp was invented in the late 1950s.</p>
<h4 class="footnotes-heading">Footnotes</h4>
<p>this should never appear, it's past the footnotes heading</p>
</section>
</body></html>
"""


@pytest.fixture
def fixture_path(tmp_path: Path) -> str:
    path = tmp_path / "1.1.xhtml"
    path.write_text(FIXTURE_HTML, encoding="utf-8")
    return str(path)


@pytest.fixture
def chapter_intro_fixture_path(tmp_path: Path) -> str:
    path = tmp_path / "Chapter-1.xhtml"
    path.write_text(CHAPTER_INTRO_FIXTURE_HTML, encoding="utf-8")
    return str(path)


def test_splits_into_one_subsection_per_h4(fixture_path):
    subsections = TexinfoHtmlAdapter().parse([fixture_path])
    assert [s.section_path for s in subsections] == [
        ["1", "1.1", "1.1.1"],
        ["1", "1.1", "1.1.2"],
    ]


def test_subsection_title_preserves_inline_code_with_correct_spacing(fixture_path):
    subsections = TexinfoHtmlAdapter().parse([fixture_path])
    assert subsections[0].section_title == "First `Sub`"


def test_intro_paragraph_before_first_h4_is_merged_into_first_subsection(fixture_path):
    subsections = TexinfoHtmlAdapter().parse([fixture_path])
    assert subsections[0].paragraphs[0].text == "Intro paragraph before any subsection."


def test_inline_formatting_becomes_markdown(fixture_path):
    subsections = TexinfoHtmlAdapter().parse([fixture_path])
    texts = [p.text for p in subsections[0].paragraphs if p.kind == ParagraphKind.text]
    assert "First paragraph with **bold** and *italic* text." in texts


def test_list_items_become_markdown_bullets(fixture_path):
    subsections = TexinfoHtmlAdapter().parse([fixture_path])
    texts = [p.text for p in subsections[0].paragraphs if p.kind == ParagraphKind.text]
    assert "- item one\n- item two" in texts


def test_code_blocks_are_preserved_verbatim_as_code_kind(fixture_path):
    subsections = TexinfoHtmlAdapter().parse([fixture_path])
    code_paragraphs = [p for p in subsections[0].paragraphs if p.kind == ParagraphKind.code]
    assert len(code_paragraphs) == 1
    assert code_paragraphs[0].text == "(define (square x) (* x x)) 486"


def test_html_comments_inside_paragraphs_are_dropped_not_rendered_as_text(fixture_path):
    # texinfo leaves internal markers like <!-- /@w --> (a "don't break here" hint)
    # as HTML comments; Comment is a NavigableString subclass in bs4, so this must
    # be explicitly excluded or it leaks into the visible text as garbage.
    subsections = TexinfoHtmlAdapter().parse([fixture_path])
    texts = [p.text for p in subsections[0].paragraphs if p.kind == ParagraphKind.text]
    assert "numbers. For example: end of sentence." in texts
    assert "/@w" not in " ".join(texts)


def test_html_comments_inside_code_blocks_are_dropped(fixture_path):
    subsections = TexinfoHtmlAdapter().parse([fixture_path])
    code_paragraphs = [p for p in subsections[0].paragraphs if p.kind == ParagraphKind.code]
    assert "/@w" not in code_paragraphs[0].text


def test_blockquote_contents_are_not_silently_dropped(fixture_path):
    # texinfo renders @quotation-style blocks as <blockquote>, wrapping a <p> and
    # an <ol> (e.g. SICP's "to evaluate a combination, do the following" rule).
    # blockquote wasn't a recognized top-level tag, so this content used to
    # vanish entirely - it must be expanded by recursing into its children.
    subsections = TexinfoHtmlAdapter().parse([fixture_path])
    texts = [p.text for p in subsections[0].paragraphs if p.kind == ParagraphKind.text]
    assert "To evaluate a combination, do the following:" in texts
    assert "- Evaluate the subexpressions.\n- Apply the procedure." in texts


def test_ascii_art_example_blocks_preserve_whitespace_verbatim(fixture_path):
    subsections = TexinfoHtmlAdapter().parse([fixture_path])
    code_paragraphs = [p for p in subsections[1].paragraphs if p.kind == ParagraphKind.code]
    assert code_paragraphs[0].text == "  a   b\n  |   |\n"


def test_footnote_definitions_are_skipped(fixture_path):
    subsections = TexinfoHtmlAdapter().parse([fixture_path])
    all_text = " ".join(p.text for s in subsections for p in s.paragraphs)
    assert "footnote definition" not in all_text


def test_stops_at_footnotes_heading(fixture_path):
    subsections = TexinfoHtmlAdapter().parse([fixture_path])
    all_text = " ".join(p.text for s in subsections for p in s.paragraphs)
    assert "never appear" not in all_text


def test_chapter_intro_file_is_parsed_not_ignored(chapter_intro_fixture_path):
    # Each chapter has its own intro file (e.g. Chapter-1.xhtml) with a completely
    # different structure - <h2 class="chapter"> instead of <h3 class="section">,
    # no numbered subsections. This content (SICP's Locke epigraph, the "sorcerer's
    # apprentice" essay, "Programming in Lisp") was never being parsed at all -
    # only the numbered 1.1/1.2/1.3-style files were ever fed to the adapter.
    subsections = TexinfoHtmlAdapter().parse([chapter_intro_fixture_path])
    assert len(subsections) == 2


def test_chapter_intro_uses_fake_section_path_ordered_before_the_first_real_section(
    chapter_intro_fixture_path,
):
    subsections = TexinfoHtmlAdapter().parse([chapter_intro_fixture_path])
    assert subsections[0].section_path == ["1", "1.0", "1.0.1"]
    assert subsections[1].section_path == ["1", "1.0", "1.0.2"]
    # lexicographically, "1.0" sorts before "1.1", so reading order is preserved
    assert subsections[0].section_path[1] < "1.1"


def test_chapter_intro_content_before_first_subsubheading_uses_the_chapter_title(
    chapter_intro_fixture_path,
):
    subsections = TexinfoHtmlAdapter().parse([chapter_intro_fixture_path])
    assert subsections[0].section_title == "Building Abstractions with Procedures"
    texts = [p.text for p in subsections[0].paragraphs]
    assert any("computational process" in t for t in texts)


def test_chapter_intro_subsubheading_starts_a_new_pseudo_subsection(chapter_intro_fixture_path):
    subsections = TexinfoHtmlAdapter().parse([chapter_intro_fixture_path])
    assert subsections[1].section_title == "Programming in Lisp"
    assert any("Lisp was invented" in p.text for p in subsections[1].paragraphs)


def test_chapter_intro_blockquote_and_comment_stripping_still_apply(chapter_intro_fixture_path):
    subsections = TexinfoHtmlAdapter().parse([chapter_intro_fixture_path])
    all_text = " ".join(p.text for p in subsections[0].paragraphs)
    assert "Combining several simple ideas" in all_text
    assert "/@w" not in all_text
