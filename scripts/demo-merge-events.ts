import { mergeEvents } from "../core/mergeEvents.js";
import type { Event } from "../schema/types/events.js";

const deviceA: Event[] = [
  { id: "e1", ts: "2026-08-01T09:00:00Z", type: "checkin", date: "2026-08-01" },
  { id: "e3", ts: "2026-08-03T09:00:00Z", type: "checkin", date: "2026-08-03" },
];

const deviceB: Event[] = [
  { id: "e2", ts: "2026-08-02T09:00:00Z", type: "checkin", date: "2026-08-02" },
  { id: "e1", ts: "2026-08-01T09:00:00Z", type: "checkin", date: "2026-08-01" }, // 同一条，两端都有
];

console.log(
  "merged:",
  mergeEvents(deviceA, deviceB).map((e) => e.id),
);
