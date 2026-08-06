import { describe, it, expect } from "vitest";
import { computeSectionHeaders, isResumingMidSection } from "./sectionHeaders";
import type { Block, SectionHeading } from "../../../schema/types/pack";

const HEADINGS: SectionHeading[] = [
  { path: ["1"], title: "Building Abstractions with Procedures" },
  { path: ["1", "1.1"], title: "The Elements of Programming" },
  { path: ["1", "1.2"], title: "Procedures and the Processes They Generate" },
];

function block(id: string, section_path: [string, ...string[]]): Block {
  return {
    id,
    seq: 1,
    section_path,
    section_title: `Title of ${section_path.at(-1)}`,
    content_md: "x",
    est_seconds: 100,
    recap_md: "...",
  };
}

describe("computeSectionHeaders", () => {
  it("emits the full chapter/section/subsection chain when previousPath is empty", () => {
    const lines = computeSectionHeaders([], block("b1", ["1", "1.1", "1.1.1"]), HEADINGS);
    expect(lines).toEqual([
      { depth: 0, label: "Chapter 1", title: "Building Abstractions with Procedures" },
      { depth: 1, label: "1.1", title: "The Elements of Programming" },
      { depth: 2, label: "1.1.1", title: "Title of 1.1.1" },
    ]);
  });

  it("emits nothing when the section path is unchanged from the previous block", () => {
    const lines = computeSectionHeaders(["1", "1.1", "1.1.1"], block("b2", ["1", "1.1", "1.1.1"]), HEADINGS);
    expect(lines).toEqual([]);
  });

  it("only emits the subsection line when just the leaf changes within the same section", () => {
    const lines = computeSectionHeaders(["1", "1.1", "1.1.1"], block("b2", ["1", "1.1", "1.1.2"]), HEADINGS);
    expect(lines).toEqual([{ depth: 2, label: "1.1.2", title: "Title of 1.1.2" }]);
  });

  it("emits section + subsection but not chapter when only the section changes", () => {
    const lines = computeSectionHeaders(["1", "1.1", "1.1.3"], block("b2", ["1", "1.2", "1.2.1"]), HEADINGS);
    expect(lines).toEqual([
      { depth: 1, label: "1.2", title: "Procedures and the Processes They Generate" },
      { depth: 2, label: "1.2.1", title: "Title of 1.2.1" },
    ]);
  });

  it("skips a heading line when the prefix has no title (synthetic path like chapter intro)", () => {
    const lines = computeSectionHeaders([], block("b1", ["1", "1.0", "1.0.1"]), HEADINGS);
    expect(lines).toEqual([
      { depth: 0, label: "Chapter 1", title: "Building Abstractions with Procedures" },
      { depth: 2, label: "1.0.1", title: "Title of 1.0.1" },
    ]);
  });

  it("does not label 'Chapter' for a non-numeric top-level path (front/back matter)", () => {
    const lines = computeSectionHeaders([], block("b1", ["foreword"]), []);
    expect(lines).toEqual([{ depth: 0, label: undefined, title: "Title of foreword" }]);
  });
});

describe("isResumingMidSection", () => {
  const path: [string, ...string[]] = ["1", "1.1", "1.1.1"];

  it("is false when nothing in the leaf section was read before", () => {
    const first = block("b2", path);
    const all = [block("b1", path), first];
    expect(isResumingMidSection(all, first, new Set())).toBe(false);
  });

  it("is true when an earlier block in the same leaf section was already read", () => {
    const first = block("b2", path);
    const all = [block("b1", path), first];
    expect(isResumingMidSection(all, first, new Set(["b1"]))).toBe(true);
  });

  it("is false when the read block is in a different section", () => {
    const first = block("b2", path);
    const all = [block("b1", ["1", "1.1", "1.1.0"]), first];
    expect(isResumingMidSection(all, first, new Set(["b1"]))).toBe(false);
  });
});
