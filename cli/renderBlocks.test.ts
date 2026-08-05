import { describe, it, expect, vi } from "vitest";
import { computeHeaderLines, indentContent, printBlocks } from "./renderBlocks.js";
import { displayWidth } from "./textWidth.js";
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

  it("does not prefix 'Chapter' for a non-numeric top-level path (front/back matter)", () => {
    // 乔布斯传的"前言"最初被顺序编成 section_path ["1"]，跟"第一章"的 ["1"]
    // 撞在一起，都被打上了"Chapter 1"标签——用户反馈"前言就是前言"，改成
    // section_path ["foreword"] 之后，非数字编号不该再套用"Chapter N"这套
    // 只为真正编号章节设计的前缀。
    const lines = computeHeaderLines([], block("b1", ["foreword"], "x"), []);
    expect(lines).toEqual(["Title of foreword"]);
  });

  it("still prefixes 'Chapter' for a numeric top-level path even without SectionHeadings", () => {
    const lines = computeHeaderLines([], block("b1", ["1"], "x"), []);
    expect(lines).toEqual(["Chapter 1  Title of 1"]);
  });
});

describe("indentContent", () => {
  it("prefixes every non-empty line with the given indent", () => {
    expect(indentContent("line one\nline two", "    ")).toBe("    line one\n    line two");
  });

  it("leaves empty lines untouched (no trailing whitespace)", () => {
    expect(indentContent("para one\n\npara two", "  ")).toBe("  para one\n\n  para two");
  });

  it("replaces the fences with a label and a border sized to the widest code line", () => {
    const code = "```scheme\n(+ 1 2)\n```";
    expect(indentContent(code, "  ")).toBe(
      "  Code (scheme):\n  -------\n  (+ 1 2)\n  -------",
    );
  });

  it("uses a bare 'Code:' label when the fence has no language tag", () => {
    const code = "```\n(+ 1 2)\n```";
    expect(indentContent(code, "  ")).toBe("  Code:\n  -------\n  (+ 1 2)\n  -------");
  });

  it("sizes the border to the longest line when a code block has multiple lines", () => {
    const code = "```scheme\n(+ 1 2)\n(display \"hello world\")\n```";
    const result = indentContent(code, "  ");
    const lines = result.split("\n");
    expect(lines[1]).toBe(`  ${"-".repeat("(display \"hello world\")".length)}`);
    expect(lines[1]).toBe(lines[4]);
  });

  it("word-wraps a long paragraph to fit the width, indenting every wrapped line", () => {
    const paragraph = "one two three four five six seven eight";
    // wrapWidth floors at 20 regardless of how narrow `width` is, so this
    // exercises the floor rather than width - indent.length directly.
    const result = indentContent(paragraph, "  ", 14);
    expect(result).toBe("  one two three four\n  five six seven eight");
  });

  it("wraps CJK text by display width (2 columns/char), not by .length", () => {
    // 旧版 wordWrap 按空格切词，一整段没有空格的中文会被当成*一个词*，
    // 塞进一行时不受 maxWidth 约束（"单个词本身比 maxWidth 还长时不强行
    // 截断"）——表现出来就是中文完全不换行，一直溢出到下一次遇到空格
    // 才断（往往是紧跟着的英文词组内部，见下一个测试）。逐字拆中文之后，
    // 中文本身要按*显示列数*（宽字符占 2 列）在 maxWidth 处断行。indent
    // 为空时 indentContent 的 wrapWidth 有 20 这个下限，所以这里用 15 个
    // 宽字符（30 列）配 20 列宽度，确保真的会触发换行。
    const paragraph = "一二三四五六七八九十甲乙丙丁戊"; // 15 个宽字符 = 30 列
    const result = indentContent(paragraph, "", 20);
    expect(result.split("\n")).toEqual(["一二三四五六七八九十", "甲乙丙丁戊"]);
  });

  it("keeps a bracketed multi-word English phrase intact when it fits within the width budget", () => {
    // 真实踩过的坑（乔布斯传预览批次）：一整段中文紧跟着一个带空格的英文
    // 机构名，比如"...埃姆斯研究中心(NASA Ames Research Center)，这里..."——
    // 旧版 wordWrap 把前面一大段中文 + "(NASA" 当成一个超长 token 塞进一行
    // （不受宽度约束，因为是按 .length 而不是显示列数比较），下一个真正的
    // 空格恰好在 "NASA" 和 "Ames" 之间，于是换行硬生生切在英文词组中间——
    // 即使按显示列数算这一整行根本没有排满。改成中文逐字拆分 + 显示列宽
    // 之后，中文只在真正接近 maxWidth 时才断行，短英文词组不会再被这个
    // 测量错误提前挤爆到下一行。
    const paragraph = "这是一段测试文字(NASA Ames Research Center)后面还有更多文字";
    const result = indentContent(paragraph, "", 50);
    expect(result).toContain("(NASA Ames Research Center)");
  });

  it("every wrapped line stays within maxWidth measured in display columns, not .length", () => {
    // 换个角度锁住同一个 bug：旧版按 .length 判断宽度，中日韩宽字符在终端
    // 里占 2 列却只算 1 个字符，会导致整行实际显示宽度远超 maxWidth。
    const paragraph = "这是一段很长很长很长很长的中文测试文字，用来确认每一行都不会超过宽度限制。";
    const result = indentContent(paragraph, "", 24);
    for (const line of result.split("\n")) {
      expect(displayWidth(line)).toBeLessThanOrEqual(24);
    }
  });

  it("does not word-wrap content inside a fenced code block, even past the width", () => {
    const code = "```scheme\n(define (very-long-procedure-name x) (+ x 1))\n```";
    const result = indentContent(code, "  ", 20);
    const border = `  ${"-".repeat("(define (very-long-procedure-name x) (+ x 1))".length)}`;
    expect(result).toBe(
      `  Code (scheme):\n${border}\n  (define (very-long-procedure-name x) (+ x 1))\n${border}`,
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
