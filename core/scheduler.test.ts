import { describe, it, expect } from "vitest";
import { leitnerScheduler, dueDateForBox, BOX_INTERVAL_DAYS } from "./scheduler.js";
import type { ItemState } from "./scheduler.js";

describe("leitnerScheduler.onAnswer", () => {
  it("sends a brand-new item's first correct answer to box 1 (3 days)", () => {
    const state = leitnerScheduler.onAnswer("k0001", true, "2026-08-01");
    expect(state.box).toBe(1);
    expect(state.dueDate).toBe("2026-08-04");
  });

  it("climbs one box per consecutive correct answer, capping at box 4", () => {
    let state: ItemState = leitnerScheduler.onAnswer("k0001", true, "2026-08-01");
    expect(state.box).toBe(1);

    state = leitnerScheduler.onAnswer("k0001", true, "2026-08-04", state);
    expect(state.box).toBe(2);

    state = leitnerScheduler.onAnswer("k0001", true, "2026-08-11", state);
    expect(state.box).toBe(3);

    state = leitnerScheduler.onAnswer("k0001", true, "2026-08-26", state);
    expect(state.box).toBe(4);

    // already at the top box; another correct answer stays at 4 (30 days).
    state = leitnerScheduler.onAnswer("k0001", true, "2026-09-25", state);
    expect(state.box).toBe(4);
    expect(state.dueDate).toBe("2026-10-25");
  });

  it("sends a wrong answer back to box 0 regardless of prior box", () => {
    const highBox: ItemState = { itemId: "k0001", box: 4, dueDate: "2026-08-01" };
    const state = leitnerScheduler.onAnswer("k0001", false, "2026-08-01", highBox);
    expect(state.box).toBe(0);
    expect(state.dueDate).toBe("2026-08-02");
  });
});

describe("leitnerScheduler.due", () => {
  it("returns only itemIds whose dueDate has arrived", () => {
    const states: ItemState[] = [
      { itemId: "overdue", box: 0, dueDate: "2026-07-30" },
      { itemId: "due-today", box: 1, dueDate: "2026-08-01" },
      { itemId: "not-yet", box: 2, dueDate: "2026-08-05" },
    ];

    expect(leitnerScheduler.due(states, "2026-08-01").sort()).toEqual([
      "due-today",
      "overdue",
    ]);
  });
});

describe("dueDateForBox", () => {
  it("matches the box interval table for a read-but-unquizzed item (box 2)", () => {
    expect(BOX_INTERVAL_DAYS[2]).toBe(7);
    expect(dueDateForBox(2, "2026-08-01")).toBe("2026-08-08");
  });
});
