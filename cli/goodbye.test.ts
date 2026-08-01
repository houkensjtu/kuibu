import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { printGoodbye } from "./goodbye.js";
import { appendEvent } from "./eventLog.js";
import { checkinDate } from "../core/checkinDate.js";

function withScratchLog(fn: (logPath: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "kuibu-goodbye-"));
  const logPath = join(dir, "events.jsonl");
  try {
    fn(logPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("printGoodbye", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tells the user today's reading will restart when today isn't checked in yet", () => {
    withScratchLog((logPath) => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      printGoodbye(logPath);
      const output = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
      expect(output).toMatch(/start over from the beginning/);
    });
  });

  it("gives a plain goodbye when today is already checked in", () => {
    withScratchLog((logPath) => {
      const today = checkinDate(new Date());
      appendEvent(logPath, {
        id: "e1",
        ts: new Date().toISOString(),
        type: "checkin",
        date: today,
      });

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      printGoodbye(logPath);
      const output = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
      expect(output).toMatch(/See you next time/);
      expect(output).not.toMatch(/start over/);
    });
  });
});
