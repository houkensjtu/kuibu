import { describe, it, expect } from "vitest";
import { buildHeatmap, computeCurrentStreak } from "./heatmap.js";

describe("buildHeatmap", () => {
  it("returns `days` cells ending at today, in ascending date order", () => {
    const cells = buildHeatmap(new Set(), "2026-08-05", 5);
    expect(cells.map((c) => c.date)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
  });

  it("marks each cell checkedIn based on the checkinDates set", () => {
    const cells = buildHeatmap(new Set(["2026-08-02", "2026-08-04"]), "2026-08-05", 5);
    expect(cells.map((c) => c.checkedIn)).toEqual([false, true, false, true, false]);
  });

  it("handles a month boundary correctly", () => {
    const cells = buildHeatmap(new Set(), "2026-08-02", 4);
    expect(cells.map((c) => c.date)).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });
});

describe("computeCurrentStreak", () => {
  it("is 0 when today itself hasn't been checked in", () => {
    const streak = computeCurrentStreak(new Set(["2026-08-01", "2026-08-02"]), "2026-08-04");
    expect(streak).toBe(0);
  });

  it("counts consecutive days ending at today", () => {
    const dates = new Set(["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"]);
    expect(computeCurrentStreak(dates, "2026-08-04")).toBe(4);
  });

  it("stops at the first gap looking backward from today", () => {
    // 2026-07-30 is checked in but 2026-07-31 is missing, breaking the streak from today.
    const dates = new Set(["2026-07-30", "2026-08-01", "2026-08-02"]);
    expect(computeCurrentStreak(dates, "2026-08-02")).toBe(2);
  });
});
