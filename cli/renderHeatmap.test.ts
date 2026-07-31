import { describe, it, expect } from "vitest";
import { renderHeatmap } from "./renderHeatmap.js";

describe("renderHeatmap", () => {
  it("renders a symbol row and a matching date-label row", () => {
    const output = renderHeatmap([
      { date: "2026-07-31", checkedIn: true },
      { date: "2026-08-01", checkedIn: false },
    ]);
    expect(output).toBe("■ ·\n07-31 08-01");
  });
});
