import { describe, it, expect } from "vitest";
import { estimateDaysRemaining } from "./completionEstimate.js";
import type { Block } from "../schema/types/pack.js";

function block(id: string, est_seconds: number): Block {
  return {
    id,
    seq: 1,
    section_path: ["1", "1.1", "1.1.1"],
    section_title: "x",
    content_md: "...",
    est_seconds,
    recap_md: "...",
  };
}

describe("estimateDaysRemaining", () => {
  it("is 0 when every block has already been read", () => {
    const blocks = [block("b1", 300), block("b2", 300)];
    const readIds = new Set(["b1", "b2"]);
    expect(estimateDaysRemaining(blocks, readIds, 720)).toBe(0);
  });

  it("divides remaining seconds by the daily target and rounds up", () => {
    // b1 (700s) is already read; 800+500=1300s remaining / 720s per day = 1.8 -> rounds up to 2 days.
    const blocks = [block("b1", 700), block("b2", 800), block("b3", 500)];
    const readIds = new Set(["b1"]);
    expect(estimateDaysRemaining(blocks, readIds, 720)).toBe(2);
  });

  it("never rounds a nonzero remainder down to 0 days", () => {
    const blocks = [block("b1", 1)];
    const readIds = new Set<string>();
    expect(estimateDaysRemaining(blocks, readIds, 720)).toBe(1);
  });

  it("handles an empty pack as already finished", () => {
    expect(estimateDaysRemaining([], new Set(), 720)).toBe(0);
  });
});
