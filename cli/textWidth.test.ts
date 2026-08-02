import { describe, it, expect } from "vitest";
import { displayWidth, padDisplayWidth } from "./textWidth.js";

describe("displayWidth", () => {
  it("counts ASCII text as one column per character", () => {
    expect(displayWidth("gatsby")).toBe(6);
    expect(displayWidth("")).toBe(0);
  });

  it("counts CJK characters as two columns each", () => {
    expect(displayWidth("西遊記")).toBe(6);
  });

  it("sums correctly for mixed ASCII and CJK text", () => {
    expect(displayWidth("SICP 第一回")).toBe(4 + 1 + 2 + 2 + 2);
  });
});

describe("padDisplayWidth", () => {
  it("pads ASCII text with spaces to reach the target visual width", () => {
    expect(padDisplayWidth("sicp", 10)).toBe("sicp      ");
  });

  it("pads CJK text with fewer spaces than an equal-length ASCII string, since each CJK char already occupies two columns", () => {
    const padded = padDisplayWidth("西遊記", 10);
    expect(padded).toBe("西遊記    ");
    expect(displayWidth(padded)).toBe(10);
  });

  it("aligns an ASCII and a CJK string to the same visual width so a following column lines up", () => {
    const target = Math.max(displayWidth("gatsby"), displayWidth("西遊記"));
    const a = padDisplayWidth("gatsby", target);
    const b = padDisplayWidth("西遊記", target);
    expect(displayWidth(a)).toBe(displayWidth(b));
  });

  it("returns the text unchanged (no truncation) when it already meets or exceeds the target width", () => {
    expect(padDisplayWidth("a very long title", 3)).toBe("a very long title");
  });
});
