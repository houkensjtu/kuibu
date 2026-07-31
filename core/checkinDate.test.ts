import { describe, it, expect } from "vitest";
import { checkinDate } from "./checkinDate.js";

describe("checkinDate", () => {
  it("counts 01:00 as the previous day (default 4h offset)", () => {
    const ts = new Date(2026, 6, 31, 1, 0, 0); // 2026-07-31 01:00 local
    expect(checkinDate(ts)).toBe("2026-07-30");
  });

  it("counts exactly 04:00 as the new day (inclusive boundary)", () => {
    const ts = new Date(2026, 6, 31, 4, 0, 0);
    expect(checkinDate(ts)).toBe("2026-07-31");
  });

  it("counts 03:59:59 as still the previous day", () => {
    const ts = new Date(2026, 6, 31, 3, 59, 59);
    expect(checkinDate(ts)).toBe("2026-07-30");
  });

  it("counts a normal daytime moment as that same day", () => {
    const ts = new Date(2026, 6, 31, 20, 0, 0);
    expect(checkinDate(ts)).toBe("2026-07-31");
  });

  it("respects a custom offset", () => {
    const ts = new Date(2026, 6, 31, 1, 0, 0);
    expect(checkinDate(ts, 0)).toBe("2026-07-31");
  });
});
