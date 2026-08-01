import { describe, it, expect } from "vitest";
import { computeProgress } from "./progress.js";
import type { Block } from "../schema/types/pack.js";

function block(id: string, seq: number, section_path: [string, ...string[]]): Block {
  return {
    id,
    seq,
    section_path,
    section_title: section_path.join("."),
    content_md: "...",
    est_seconds: 100,
    recap_md: "...",
  };
}

describe("computeProgress", () => {
  const blocks: Block[] = [
    block("b0001", 1, ["1", "1.1", "1.1.1"]),
    block("b0002", 2, ["1", "1.1", "1.1.1"]),
    block("b0003", 3, ["1", "1.1", "1.1.2"]),
    block("b0004", 4, ["1", "1.1", "1.1.3"]),
  ];

  it("reports 0% and no completed section when nothing has been read", () => {
    const result = computeProgress(blocks, new Set());
    expect(result).toEqual({ lastCompletedSectionPath: null, percentRead: 0 });
  });

  it("does not count a section as completed until every one of its blocks is read", () => {
    const result = computeProgress(blocks, new Set(["b0001"]));
    expect(result.lastCompletedSectionPath).toBeNull();
    expect(result.percentRead).toBe(25);
  });

  it("reports the furthest-along fully-completed section", () => {
    const result = computeProgress(blocks, new Set(["b0001", "b0002", "b0003"]));
    expect(result.lastCompletedSectionPath).toEqual(["1", "1.1", "1.1.2"]);
    expect(result.percentRead).toBe(75);
  });

  it("reports 100% once every block is read", () => {
    const result = computeProgress(blocks, new Set(blocks.map((b) => b.id)));
    expect(result.lastCompletedSectionPath).toEqual(["1", "1.1", "1.1.3"]);
    expect(result.percentRead).toBe(100);
  });

  it("handles an empty pack without dividing by zero", () => {
    expect(computeProgress([], new Set())).toEqual({
      lastCompletedSectionPath: null,
      percentRead: 0,
    });
  });
});
