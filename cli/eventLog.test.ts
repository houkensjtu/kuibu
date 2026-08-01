import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { appendEvent, readEvents, writeEvents } from "./eventLog.js";
import type { Event } from "../schema/types/events.js";

let dir: string;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("eventLog", () => {
  it("returns an empty array when the log file doesn't exist yet", () => {
    dir = mkdtempSync(join(tmpdir(), "kuibu-log-"));
    expect(readEvents(join(dir, "events.jsonl"))).toEqual([]);
  });

  it("appends one JSON line per event and reads them back in order", () => {
    dir = mkdtempSync(join(tmpdir(), "kuibu-log-"));
    const logPath = join(dir, "events.jsonl");

    const e1: Event = {
      id: "e1",
      ts: "2026-08-01T09:00:00Z",
      type: "session_start",
      book_id: "sicp",
      target_seconds: 720,
    };
    const e2: Event = {
      id: "e2",
      ts: "2026-08-01T09:05:00Z",
      type: "block_read",
      block_id: "b0001",
      seconds: 150,
    };

    appendEvent(logPath, e1);
    appendEvent(logPath, e2);

    const raw = readFileSync(logPath, "utf-8");
    expect(raw.split("\n").filter((l) => l.trim().length > 0)).toHaveLength(2);

    expect(readEvents(logPath)).toEqual([e1, e2]);
  });

  it("creates parent directories if they don't exist yet", () => {
    dir = mkdtempSync(join(tmpdir(), "kuibu-log-"));
    const logPath = join(dir, "nested", "deeper", "events.jsonl");

    appendEvent(logPath, {
      id: "e1",
      ts: "2026-08-01T09:00:00Z",
      type: "checkin",
      date: "2026-08-01",
    });

    expect(readEvents(logPath)).toHaveLength(1);
  });

  it("only grows the file - never truncates on repeated appends", () => {
    dir = mkdtempSync(join(tmpdir(), "kuibu-log-"));
    const logPath = join(dir, "events.jsonl");

    for (let i = 0; i < 5; i++) {
      appendEvent(logPath, {
        id: `e${i}`,
        ts: "2026-08-01T09:00:00Z",
        type: "checkin",
        date: "2026-08-01",
      });
    }

    expect(readEvents(logPath)).toHaveLength(5);
  });

  it("writeEvents overwrites the file with exactly the given events, in order", () => {
    dir = mkdtempSync(join(tmpdir(), "kuibu-log-"));
    const logPath = join(dir, "events.jsonl");

    appendEvent(logPath, {
      id: "stale",
      ts: "2026-08-01T09:00:00Z",
      type: "checkin",
      date: "2026-08-01",
    });

    const fresh: Event[] = [
      { id: "e1", ts: "2026-08-01T09:00:00Z", type: "checkin", date: "2026-08-01" },
      { id: "e2", ts: "2026-08-02T09:00:00Z", type: "checkin", date: "2026-08-02" },
    ];
    writeEvents(logPath, fresh);

    expect(readEvents(logPath)).toEqual(fresh);
  });

  it("writeEvents with an empty array leaves an empty (not missing) file", () => {
    dir = mkdtempSync(join(tmpdir(), "kuibu-log-"));
    const logPath = join(dir, "events.jsonl");

    writeEvents(logPath, []);

    expect(readEvents(logPath)).toEqual([]);
  });
});
