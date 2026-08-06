import { describe, expect, it } from "vitest";
import { checkinDatesFromEvents } from "./checkinDates";
import type { Event } from "../../../schema/types/events";

function checkin(date: string): Event {
  return { id: `e-${date}`, ts: `${date}T12:00:00.000Z`, type: "checkin", date };
}

function blockRead(): Event {
  return { id: "e-block", ts: "2026-08-01T12:00:00.000Z", type: "block_read", block_id: "b0001", seconds: 90 };
}

describe("checkinDatesFromEvents", () => {
  it("returns an empty set for an empty log", () => {
    expect(checkinDatesFromEvents([])).toEqual(new Set());
  });

  it("collects dates from checkin events only, ignoring other event types", () => {
    const events = [blockRead(), checkin("2026-08-01"), checkin("2026-08-02")];
    expect(checkinDatesFromEvents(events)).toEqual(new Set(["2026-08-01", "2026-08-02"]));
  });

  it("dedupes repeated checkins on the same date", () => {
    const events = [checkin("2026-08-01"), checkin("2026-08-01")];
    expect(checkinDatesFromEvents(events)).toEqual(new Set(["2026-08-01"]));
  });
});
