import { describe, it, expect } from "vitest";
import { mergeEvents } from "./mergeEvents.js";
import type { Event } from "../schema/types/events.js";

function checkin(id: string, ts: string, date: string): Event {
  return { id, ts, type: "checkin", date };
}

describe("mergeEvents", () => {
  it("sorts the union of two logs by ts", () => {
    const a = [checkin("e1", "2026-08-02T09:00:00Z", "2026-08-02")];
    const b = [checkin("e2", "2026-08-01T09:00:00Z", "2026-08-01")];

    expect(mergeEvents(a, b).map((e) => e.id)).toEqual(["e2", "e1"]);
  });

  it("de-duplicates events that share an id, keeping one copy", () => {
    const shared = checkin("e1", "2026-08-01T09:00:00Z", "2026-08-01");
    const merged = mergeEvents([shared], [shared]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(shared);
  });

  it("breaks ts ties by id for a stable order", () => {
    const a = [checkin("e2", "2026-08-01T09:00:00Z", "2026-08-01")];
    const b = [checkin("e1", "2026-08-01T09:00:00Z", "2026-08-01")];

    expect(mergeEvents(a, b).map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("merges two logs from two ends without either one 'winning' wholesale", () => {
    const deviceA = [
      checkin("e1", "2026-08-01T09:00:00Z", "2026-08-01"),
      checkin("e3", "2026-08-03T09:00:00Z", "2026-08-03"),
    ];
    const deviceB = [
      checkin("e2", "2026-08-02T09:00:00Z", "2026-08-02"),
      checkin("e1", "2026-08-01T09:00:00Z", "2026-08-01"), // same event, synced back
    ];

    expect(mergeEvents(deviceA, deviceB).map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
  });
});
