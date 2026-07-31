import { describe, it, expect } from "vitest";
import { reduceEvents } from "./reducer.js";
import type { Event } from "../schema/types/events.js";

const questionItemMap = new Map([["q0001", "k0001"]]);

describe("reduceEvents", () => {
  it("folds block_read events into a set of read block ids", () => {
    const events: Event[] = [
      { id: "e1", ts: "2026-08-01T10:00:00Z", type: "block_read", block_id: "b0001", seconds: 150 },
      { id: "e2", ts: "2026-08-01T10:03:00Z", type: "block_read", block_id: "b0002", seconds: 140 },
    ];

    const state = reduceEvents(events, questionItemMap);
    expect(state.readBlockIds).toEqual(new Set(["b0001", "b0002"]));
  });

  it("resolves an answer's question_id to itemId via the map and advances its box", () => {
    const events: Event[] = [
      { id: "e1", ts: "2026-08-01T10:00:00Z", type: "answer", question_id: "q0001", correct: true },
    ];

    const state = reduceEvents(events, questionItemMap);
    const item = state.itemStates.get("k0001");
    expect(item?.box).toBe(1);
    expect(state.wrongQuestionIdByItemId.has("k0001")).toBe(false);
  });

  it("tracks a wrong answer in wrongQuestionIdByItemId until answered correctly", () => {
    const wrongOnly = reduceEvents(
      [{ id: "e1", ts: "2026-08-01T10:00:00Z", type: "answer", question_id: "q0001", correct: false }],
      questionItemMap,
    );
    expect(wrongOnly.itemStates.get("k0001")?.box).toBe(0);
    expect(wrongOnly.wrongQuestionIdByItemId.get("k0001")).toBe("q0001");

    const thenCorrect = reduceEvents(
      [
        { id: "e1", ts: "2026-08-01T10:00:00Z", type: "answer", question_id: "q0001", correct: false },
        { id: "e2", ts: "2026-08-01T10:05:00Z", type: "answer", question_id: "q0001", correct: true },
      ],
      questionItemMap,
    );
    expect(thenCorrect.itemStates.get("k0001")?.box).toBe(1);
    expect(thenCorrect.wrongQuestionIdByItemId.has("k0001")).toBe(false);
  });

  it("collects checkin dates verbatim, without recomputing them", () => {
    const events: Event[] = [
      { id: "e1", ts: "2026-08-01T22:00:00Z", type: "checkin", date: "2026-08-01" },
      { id: "e2", ts: "2026-08-02T22:00:00Z", type: "checkin", date: "2026-08-02" },
    ];

    const state = reduceEvents(events, questionItemMap);
    expect(state.checkinDates).toEqual(new Set(["2026-08-01", "2026-08-02"]));
  });

  it("lets settings_change override session_start's daily target", () => {
    const events: Event[] = [
      { id: "e1", ts: "2026-08-01T09:00:00Z", type: "session_start", book_id: "sicp", target_seconds: 720 },
      {
        id: "e2",
        ts: "2026-08-01T09:30:00Z",
        type: "settings_change",
        key: "daily_target_seconds",
        value: 600,
      },
    ];

    const state = reduceEvents(events, questionItemMap);
    expect(state.dailyTargetSeconds).toBe(600);
  });

  it("ignores an answer for an unknown question_id instead of throwing", () => {
    const events: Event[] = [
      { id: "e1", ts: "2026-08-01T10:00:00Z", type: "answer", question_id: "q-does-not-exist", correct: true },
    ];

    expect(() => reduceEvents(events, questionItemMap)).not.toThrow();
    expect(reduceEvents(events, questionItemMap).itemStates.size).toBe(0);
  });
});
