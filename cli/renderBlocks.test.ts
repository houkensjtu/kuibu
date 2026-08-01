import { describe, it, expect, vi } from "vitest";
import { renderSectionHeader, printBlocks } from "./renderBlocks.js";
import type { Block } from "../schema/types/pack.js";

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

describe("renderSectionHeader", () => {
  it("puts 'Chapter N' first, then the rest of the path, then the title", () => {
    expect(renderSectionHeader(["1", "1.1", "1.1.3"], "Evaluating Combinations")).toBe(
      "Chapter 1 › 1.1 › 1.1.3  Evaluating Combinations",
    );
  });

  it("handles a bare chapter-only path", () => {
    expect(renderSectionHeader(["1"], "Intro")).toBe("Chapter 1  Intro");
  });
});

describe("printBlocks", () => {
  it("prints every block's header and content, in order", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const blocks = [
      block("b0001", ["1", "1.1", "1.1.1"], "first content"),
      block("b0002", ["1", "1.1", "1.1.2"], "second content"),
    ];

    printBlocks(blocks);

    const output = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Chapter 1 › 1.1 › 1.1.1  Title of 1.1.1");
    expect(output).toContain("first content");
    expect(output).toContain("Chapter 1 › 1.1 › 1.1.2  Title of 1.1.2");
    expect(output).toContain("second content");
    expect(output.indexOf("first content")).toBeLessThan(output.indexOf("Title of 1.1.2"));

    logSpy.mockRestore();
  });

  it("does nothing when given an empty block list", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    printBlocks([]);
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
