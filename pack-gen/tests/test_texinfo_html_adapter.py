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


@pytest.fixture
def fixture_path(tmp_path: Path) -> str:
    path = tmp_path / "1.1.xhtml"
    path.write_text(FIXTURE_HTML, encoding="utf-8")
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
