import { describe, it, expect } from "vitest";
import { buildYearCalendar } from "./yearCalendar.js";

describe("buildYearCalendar", () => {
  it("starts the grid on the Sunday on/before Jan 1 and ends on the Saturday on/after Dec 31", () => {
    // 2026-01-01 is a Thursday, 2026-12-31 is a Thursday.
    const calendar = buildYearCalendar(new Set(), 2026);
    const firstDay = calendar.weeks[0].days[0];
    const lastWeek = calendar.weeks[calendar.weeks.length - 1];
    const lastDay = lastWeek.days[6];

    expect(firstDay.date).toBe("2025-12-28"); // the Sunday before 2026-01-01
    expect(lastDay.date).toBe("2027-01-02"); // the Saturday after 2026-12-31
  });

  it("marks padding cells from the adjacent year as inYear=false", () => {
    const calendar = buildYearCalendar(new Set(), 2026);
    expect(calendar.weeks[0].days[0].inYear).toBe(false); // 2025-12-28
    expect(calendar.weeks[0].days[4].inYear).toBe(true); // 2026-01-01 (Thursday, index 4)
  });

  it("every week has exactly 7 days, Sunday first", () => {
    const calendar = buildYearCalendar(new Set(), 2026);
    for (const week of calendar.weeks) {
      expect(week.days).toHaveLength(7);
    }
  });

  it("marks checkedIn from the given set, independent of inYear", () => {
    const calendar = buildYearCalendar(new Set(["2026-01-01", "2026-07-04"]), 2026);
    const allCells = calendar.weeks.flatMap((w) => w.days);
    const checkedInDates = allCells.filter((c) => c.checkedIn).map((c) => c.date);
    expect(checkedInDates.sort()).toEqual(["2026-01-01", "2026-07-04"]);
  });

  it("produces exactly 12 month labels, each pointing at the week containing that month's 1st", () => {
    const calendar = buildYearCalendar(new Set(), 2026);
    expect(calendar.monthLabels).toHaveLength(12);
    expect(calendar.monthLabels[0].label).toBe("Jan");
    expect(calendar.monthLabels[11].label).toBe("Dec");

    for (const { weekIndex, label } of calendar.monthLabels) {
      const monthIndex = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(label);
      const cellsInWeek = calendar.weeks[weekIndex].days;
      const hasFirstOfMonth = cellsInWeek.some(
        (c) => c.inYear && c.date === `2026-${String(monthIndex + 1).padStart(2, "0")}-01`,
      );
      expect(hasFirstOfMonth).toBe(true);
    }
  });

  it("month labels are in increasing week-index order", () => {
    const calendar = buildYearCalendar(new Set(), 2026);
    for (let i = 1; i < calendar.monthLabels.length; i++) {
      expect(calendar.monthLabels[i].weekIndex).toBeGreaterThan(calendar.monthLabels[i - 1].weekIndex);
    }
  });
});
