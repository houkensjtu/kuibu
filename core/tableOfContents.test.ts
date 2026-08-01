import { describe, it, expect } from "vitest";
import { buildTableOfContents } from "./tableOfContents.js";
import type { Block } from "../schema/types/pack.js";

function block(id: string, seq: number, section_path: [string, ...string[]], section_title: string): Block {
  return {
    id,
    seq,
    section_path,
    section_title,
    content_md: "...",
    est_seconds: 100,
    recap_md: "...",
  };
}

describe("buildTableOfContents", () => {
  it("collapses multiple blocks in the same section into one entry", () => {
    const blocks: Block[] = [
      block("b0001", 1, ["1", "1.1", "1.1.1"], "Expressions"),
      block("b0002", 2, ["1", "1.1", "1.1.1"], "Expressions"),
      block("b0003", 3, ["1", "1.1", "1.1.2"], "Naming and the Environment"),
    ];
    const toc = buildTableOfContents(blocks);
    expect(toc).toEqual([
      { sectionPath: ["1", "1.1", "1.1.1"], sectionTitle: "Expressions" },
      { sectionPath: ["1", "1.1", "1.1.2"], sectionTitle: "Naming and the Environment" },
    ]);
  });

  it("preserves block/seq order, not alphabetical order", () => {
    const blocks: Block[] = [
      block("b0001", 1, ["1", "1.2", "1.2.1"], "Linear Recursion and Iteration"),
      block("b0002", 2, ["1", "1.1", "1.1.1"], "Expressions"),
    ];
    const toc = buildTableOfContents(blocks);
    expect(toc.map((e) => e.sectionPath.at(-1))).toEqual(["1.2.1", "1.1.1"]);
  });

  it("returns an empty list for an empty pack", () => {
    expect(buildTableOfContents([])).toEqual([]);
  });
});
