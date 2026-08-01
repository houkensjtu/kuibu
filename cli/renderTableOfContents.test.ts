import { describe, it, expect } from "vitest";
import { renderTableOfContents } from "./renderTableOfContents.js";
import type { TocRow } from "../core/tableOfContents.js";

const toc: TocRow[] = [
  { kind: "leaf", sectionPath: ["1", "1.1", "1.1.1"], sectionTitle: "Expressions" },
  { kind: "leaf", sectionPath: ["1", "1.1", "1.1.2"], sectionTitle: "Naming and the Environment" },
  { kind: "leaf", sectionPath: ["1", "1.1", "1.1.3"], sectionTitle: "Evaluating Combinations" },
];

describe("renderTableOfContents", () => {
  it("renders one line per row", () => {
    const output = renderTableOfContents(toc, null);
    expect(output.split("\n")).toHaveLength(3);
  });

  it("marks the current section with an arrow and 'you are here today'", () => {
    const output = renderTableOfContents(toc, ["1", "1.1", "1.1.2"]);
    const lines = output.split("\n");
    expect(lines[1]).toBe("→     1.1.2  Naming and the Environment  (you are here today)");
    expect(lines[0]).toBe("      1.1.1  Expressions");
    expect(lines[2]).toBe("      1.1.3  Evaluating Combinations");
  });

  it("marks nothing when currentSectionPath is null (book finished)", () => {
    const output = renderTableOfContents(toc, null);
    expect(output).not.toContain("→");
    expect(output).not.toContain("you are here today");
  });

  it("marks nothing when currentSectionPath doesn't match any entry", () => {
    const output = renderTableOfContents(toc, ["1", "1.2", "1.2.1"]);
    expect(output).not.toContain("→");
  });

  it("indents heading rows less than leaf rows, reflecting the hierarchy", () => {
    const withHeadings: TocRow[] = [
      { kind: "heading", sectionPath: ["1"], sectionTitle: "Building Abstractions with Procedures" },
      { kind: "heading", sectionPath: ["1", "1.1"], sectionTitle: "The Elements of Programming" },
      { kind: "leaf", sectionPath: ["1", "1.1", "1.1.1"], sectionTitle: "Expressions" },
    ];
    const lines = renderTableOfContents(withHeadings, null).split("\n");
    expect(lines[0]).toBe("  1  Building Abstractions with Procedures");
    expect(lines[1]).toBe("    1.1  The Elements of Programming");
    expect(lines[2]).toBe("      1.1.1  Expressions");
  });

  it("never marks a heading row as the current position, even if its path happened to match", () => {
    const withHeadings: TocRow[] = [
      { kind: "heading", sectionPath: ["1"], sectionTitle: "Building Abstractions with Procedures" },
    ];
    const output = renderTableOfContents(withHeadings, ["1"]);
    expect(output).not.toContain("→");
  });
});
