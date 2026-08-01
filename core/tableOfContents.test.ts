import { describe, it, expect } from "vitest";
import { buildTableOfContents } from "./tableOfContents.js";
import type { Block, SectionHeading } from "../schema/types/pack.js";

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
  it("collapses multiple blocks in the same section into one leaf row", () => {
    const blocks: Block[] = [
      block("b0001", 1, ["1", "1.1", "1.1.1"], "Expressions"),
      block("b0002", 2, ["1", "1.1", "1.1.1"], "Expressions"),
      block("b0003", 3, ["1", "1.1", "1.1.2"], "Naming and the Environment"),
    ];
    const toc = buildTableOfContents(blocks, []);
    expect(toc).toEqual([
      { kind: "leaf", sectionPath: ["1", "1.1", "1.1.1"], sectionTitle: "Expressions" },
      { kind: "leaf", sectionPath: ["1", "1.1", "1.1.2"], sectionTitle: "Naming and the Environment" },
    ]);
  });

  it("inserts a chapter heading and a section heading before the first leaf under each, only once", () => {
    const blocks: Block[] = [
      block("b0001", 1, ["1", "1.1", "1.1.1"], "Expressions"),
      block("b0002", 2, ["1", "1.1", "1.1.2"], "Naming and the Environment"),
      block("b0003", 3, ["1", "1.2", "1.2.1"], "Linear Recursion and Iteration"),
    ];
    const headings: SectionHeading[] = [
      { path: ["1"], title: "Building Abstractions with Procedures" },
      { path: ["1", "1.1"], title: "The Elements of Programming" },
      { path: ["1", "1.2"], title: "Procedures and the Processes They Generate" },
    ];

    const toc = buildTableOfContents(blocks, headings);
    expect(toc).toEqual([
      { kind: "heading", sectionPath: ["1"], sectionTitle: "Building Abstractions with Procedures" },
      { kind: "heading", sectionPath: ["1", "1.1"], sectionTitle: "The Elements of Programming" },
      { kind: "leaf", sectionPath: ["1", "1.1", "1.1.1"], sectionTitle: "Expressions" },
      { kind: "leaf", sectionPath: ["1", "1.1", "1.1.2"], sectionTitle: "Naming and the Environment" },
      { kind: "heading", sectionPath: ["1", "1.2"], sectionTitle: "Procedures and the Processes They Generate" },
      { kind: "leaf", sectionPath: ["1", "1.2", "1.2.1"], sectionTitle: "Linear Recursion and Iteration" },
    ]);
  });

  it("does not insert a heading row for a synthetic prefix with no matching heading (e.g. chapter-intro '1.0')", () => {
    const blocks: Block[] = [
      block("b0001", 1, ["1", "1.0", "1.0.1"], "Building Abstractions with Procedures"),
    ];
    const headings: SectionHeading[] = [
      { path: ["1"], title: "Building Abstractions with Procedures" },
    ];

    const toc = buildTableOfContents(blocks, headings);
    expect(toc).toEqual([
      { kind: "heading", sectionPath: ["1"], sectionTitle: "Building Abstractions with Procedures" },
      { kind: "leaf", sectionPath: ["1", "1.0", "1.0.1"], sectionTitle: "Building Abstractions with Procedures" },
    ]);
  });

  it("preserves block/seq order, not alphabetical order", () => {
    const blocks: Block[] = [
      block("b0001", 1, ["1", "1.2", "1.2.1"], "Linear Recursion and Iteration"),
      block("b0002", 2, ["1", "1.1", "1.1.1"], "Expressions"),
    ];
    const toc = buildTableOfContents(blocks, []);
    const leaves = toc.filter((r) => r.kind === "leaf");
    expect(leaves.map((e) => e.sectionPath.at(-1))).toEqual(["1.2.1", "1.1.1"]);
  });

  it("returns an empty list for an empty pack", () => {
    expect(buildTableOfContents([], [])).toEqual([]);
  });
});
