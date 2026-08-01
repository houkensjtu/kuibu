import { describe, it, expect, vi } from "vitest";
import { computeHeaderLines, indentContent, printBlocks } from "./renderBlocks.js";
import type { Block, SectionHeading } from "../schema/types/pack.js";

const HEADINGS: SectionHeading[] = [
  { path: ["1"], title: "Building Abstractions with Procedures" },
  { path: ["1", "1.1"], title: "The Elements of Programming" },
  { path: ["1", "1.2"], title: "Procedures and the Processes They Generate" },
];

function block(id: string, section_path: [string, ...string[]], content_md: string): Block {
  return {
    id,
    seq: 1,
    section_path,
    section_title: `Title of ${section_path.at(-1)}`,
    content_md,
    est_seconds: 100,
    recap_md: "...",
  };
}

describe("computeHeaderLines", () => {
  it("prints the full chapter/section/subsection chain when previousPath is empty", () => {
    const lines = computeHeaderLines([], block("b1", ["1", "1.1", "1.1.1"], "x"), HEADINGS);
    expect(lines).toEqual([
      "Chapter 1  Building Abstractions with Procedures",
      "  1.1  The Elements of Programming",
      "    1.1.1  Title of 1.1.1",
    ]);
  });

  it("prints nothing when the section path is unchanged from the previous block", () => {
    const lines = computeHeaderLines(["1", "1.1", "1.1.1"], block("b2", ["1", "1.1", "1.1.1"], "x"), HEADINGS);
    expect(lines).toEqual([]);
  });

  it("only prints the subsection line when just the leaf changes within the same section", () => {
    const lines = computeHeaderLines(["1", "1.1", "1.1.1"], block("b2", ["1", "1.1", "1.1.2"], "x"), HEADINGS);
    expect(lines).toEqual(["    1.1.2  Title of 1.1.2"]);
  });

  it("prints section + subsection but not chapter when only the section changes", () => {
    const lines = computeHeaderLines(["1", "1.1", "1.1.3"], block("b2", ["1", "1.2", "1.2.1"], "x"), HEADINGS);
    expect(lines).toEqual([
      "  1.2  Procedures and the Processes They Generate",
      "    1.2.1  Title of 1.2.1",
    ]);
  });

  it("skips a heading line when the prefix has no title (synthetic path like chapter intro)", () => {
    const lines = computeHeaderLines([], block("b1", ["1", "1.0", "1.0.1"], "x"), HEADINGS);
    expect(lines).toEqual([
      "Chapter 1  Building Abstractions with Procedures",
      "    1.0.1  Title of 1.0.1",
    ]);
  });
});

describe("indentContent", () => {
  it("prefixes every non-empty line with the given indent", () => {
    expect(indentContent("line one\nline two", "    ")).toBe("    line one\n    line two");
  });

  it("leaves empty lines untouched (no trailing whitespace)", () => {
    expect(indentContent("para one\n\npara two", "  ")).toBe("  para one\n\n  para two");
  });

  it("replaces the opening fence with a plain-text label naming the language, and drops the closing fence", () => {
    const code = "```scheme\n(+ 1 2)\n```";
    expect(indentContent(code, "  ")).toBe("  Code (scheme):\n  (+ 1 2)");
  });

  it("uses a bare 'Code:' label when the fence has no language tag", () => {
    const code = "```\n(+ 1 2)\n```";
    expect(indentContent(code, "  ")).toBe("  Code:\n  (+ 1 2)");
  });

  it("word-wraps a long paragraph to fit the width, indenting every wrapped line", () => {
    const paragraph = "one two three four five six seven eight";
    // wrapWidth floors at 20 regardless of how narrow `width` is, so this
    // exercises the floor rather than width - indent.length directly.
    const result = indentContent(paragraph, "  ", 14);
    expect(result).toBe("  one two three four\n  five six seven eight");
  });

  it("does not word-wrap content inside a fenced code block, even past the width", () => {
    const code = "```scheme\n(define (very-long-procedure-name x) (+ x 1))\n```";
    const result = indentContent(code, "  ", 20);
    expect(result).toBe(
      "  Code (scheme):\n  (define (very-long-procedure-name x) (+ x 1))",
    );
  });
});

describe("printBlocks", () => {
  it("prints headers only when the section changes, and content for every block", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const blocks = [
      block("b0001", ["1", "1.1", "1.1.1"], "first content"),
      block("b0002", ["1", "1.1", "1.1.1"], "second content"),
      block("b0003", ["1", "1.1", "1.1.2"], "third content"),
    ];

    printBlocks(blocks, HEADINGS);

    const output = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Chapter 1  Building Abstractions with Procedures");
    expect(output).toContain("1.1.1  Title of 1.1.1");
    expect(output).toContain("first content");
    expect(output).toContain("second content");
    expect(output).toContain("1.1.2  Title of 1.1.2");
    expect(output).toContain("third content");
    // second block shares b0001's section, so its header must not repeat
    expect(output.match(/Title of 1\.1\.1/g)).toHaveLength(1);

    logSpy.mockRestore();
  });

  it("indents content to one level deeper than the block's own section depth", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    printBlocks([block("b0001", ["1", "1.1", "1.1.1"], "some content")], HEADINGS);

    const contentCall = logSpy.mock.calls.map((args) => args[0]).find((line) => line?.includes("some content"));
    expect(contentCall).toBe("      some content");

    logSpy.mockRestore();
  });

  it("inserts a '...' line under the first block's header when resuming mid-section", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    printBlocks([block("b0001", ["1", "1.1", "1.1.1"], "content")], HEADINGS, {
      resumingMidSection: true,
    });

    const output = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("      ...");
    expect(output.indexOf("...")).toBeLessThan(output.indexOf("content"));

    logSpy.mockRestore();
  });

  it("does not insert '...' when not resuming mid-section", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    printBlocks([block("b0001", ["1", "1.1", "1.1.1"], "content")], HEADINGS);
    const output = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).not.toContain("...");
    logSpy.mockRestore();
  });

  it("does nothing when given an empty block list", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    printBlocks([], HEADINGS);
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
