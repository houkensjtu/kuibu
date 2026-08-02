import { describe, it, expect } from "vitest";
import { assertLogMatchesPack, LogBookMismatchError } from "./logGuard.js";
import type { Event } from "../schema/types/events.js";

describe("assertLogMatchesPack", () => {
  it("does nothing when the log is empty (not yet claimed by any book)", () => {
    expect(() => assertLogMatchesPack([], "gatsby", ".kuibu-events-gatsby.jsonl")).not.toThrow();
  });

  it("does nothing when the log's book_id matches the loaded pack", () => {
    const events: Event[] = [
      { id: "e1", ts: "2026-08-01T10:00:00Z", type: "session_start", book_id: "gatsby", target_seconds: 720 },
    ];
    expect(() => assertLogMatchesPack(events, "gatsby", ".kuibu-events-gatsby.jsonl")).not.toThrow();
  });

  it("throws LogBookMismatchError when the log already belongs to a different book", () => {
    const events: Event[] = [
      { id: "e1", ts: "2026-08-01T10:00:00Z", type: "session_start", book_id: "sicp", target_seconds: 720 },
    ];
    expect(() => assertLogMatchesPack(events, "gatsby", ".kuibu-events.jsonl")).toThrow(
      LogBookMismatchError,
    );
  });
});
