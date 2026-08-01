import { describe, it, expect } from "vitest";
import { renderYearCalendar } from "./renderYearCalendar.js";
import { buildYearCalendar } from "../core/yearCalendar.js";

describe("renderYearCalendar", () => {
  it("renders 8 lines: one month-label row plus 7 weekday rows", () => {
    const calendar = buildYearCalendar(new Set(), 2026);
    const output = renderYearCalendar(calendar);
    const lines = output.split("\n");
    expect(lines).toHaveLength(8);
  });

  it("each weekday row starts with its 3-letter label", () => {
    const calendar = buildYearCalendar(new Set(), 2026);
    const lines = renderYearCalendar(calendar).split("\n");
    expect(lines[1].startsWith("Sun")).toBe(true);
    expect(lines[2].startsWith("Mon")).toBe(true);
    expect(lines[7].startsWith("Sat")).toBe(true);
  });

  it("the month-label row contains all 12 month abbreviations in order", () => {
    const calendar = buildYearCalendar(new Set(), 2026);
    const monthRow = renderYearCalendar(calendar).split("\n")[0];
    const found = [...monthRow.matchAll(/[A-Z][a-z]{2}/g)].map((m) => m[0]);
    expect(found).toEqual([
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]);
  });

  it("marks a checked-in day with the filled symbol", () => {
    const calendar = buildYearCalendar(new Set(["2026-01-01"]), 2026);
    const lines = renderYearCalendar(calendar).split("\n");
    // 2026-01-01 is a Thursday -> row index 4 (Sun=1,Mon=2,Tue=3,Wed=4,Thu=5 in `lines`)
    const thursdayRow = lines[5];
    expect(thursdayRow).toContain("■");
  });

  it("out-of-year padding cells render as blank, not a dot", () => {
    const calendar = buildYearCalendar(new Set(), 2026);
    const sundayRow = renderYearCalendar(calendar).split("\n")[1];
    // The very first Sunday column is 2025-12-28, a padding cell.
    const firstCell = sundayRow.slice(GUTTER_WIDTH_FOR_TEST, GUTTER_WIDTH_FOR_TEST + 1);
    expect(firstCell).toBe(" ");
  });
});

const GUTTER_WIDTH_FOR_TEST = 4;
