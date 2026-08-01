import { describe, it, expect } from "vitest";
import { reduceEvents, blockIdsReadOnDate } from "./reducer.js";
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

// 用本地时间构造再转 ISO，跟 checkinDate.test.ts 一样的手法——保证测试结果
// 不依赖跑测试的机器在哪个时区，因为 checkinDate() 内部用的是本地时间 getter。
const localTs = (y: number, monthIndex: number, d: number, h: number): string =>
  new Date(y, monthIndex, d, h, 0, 0).toISOString();

describe("blockIdsReadOnDate", () => {
  it("returns only the block ids whose block_read falls on the given checkin-day", () => {
    const events: Event[] = [
      { id: "e1", ts: localTs(2026, 7, 1, 10), type: "block_read", block_id: "b0001", seconds: 100 },
      { id: "e2", ts: localTs(2026, 7, 1, 11), type: "block_read", block_id: "b0002", seconds: 100 },
      // 2026-08-02 凌晨 1 点，早于 4 点偏移边界，算作 2026-08-01 这天
      { id: "e3", ts: localTs(2026, 7, 2, 1), type: "block_read", block_id: "b0003", seconds: 100 },
      // 2026-08-02 上午 9 点，正常算 2026-08-02
      { id: "e4", ts: localTs(2026, 7, 2, 9), type: "block_read", block_id: "b0004", seconds: 100 },
    ];

    expect(blockIdsReadOnDate(events, "2026-08-01")).toEqual(
      new Set(["b0001", "b0002", "b0003"]),
    );
    expect(blockIdsReadOnDate(events, "2026-08-02")).toEqual(new Set(["b0004"]));
  });

  it("ignores non-block_read events and returns an empty set when nothing matches", () => {
    const events: Event[] = [
      { id: "e1", ts: localTs(2026, 7, 1, 10), type: "answer", question_id: "q0001", correct: true },
      { id: "e2", ts: localTs(2026, 7, 1, 10), type: "checkin", date: "2026-08-01" },
    ];

    expect(blockIdsReadOnDate(events, "2026-08-01")).toEqual(new Set());
  });
});
