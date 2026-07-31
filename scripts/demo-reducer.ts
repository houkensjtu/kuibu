import { reduceEvents } from "../core/reducer.js";
import type { Event } from "../schema/types/events.js";

const questionItemMap = new Map([["q0001", "k0001"]]);

const jsonl = `
{"id":"e1","ts":"2026-08-01T09:00:00Z","type":"session_start","book_id":"sicp","target_seconds":720}
{"id":"e2","ts":"2026-08-01T09:05:00Z","type":"block_read","block_id":"b0001","seconds":150}
{"id":"e3","ts":"2026-08-01T09:08:00Z","type":"block_read","block_id":"b0002","seconds":140}
{"id":"e4","ts":"2026-08-01T09:10:00Z","type":"answer","question_id":"q0001","correct":false}
{"id":"e5","ts":"2026-08-02T09:10:00Z","type":"answer","question_id":"q0001","correct":true}
{"id":"e6","ts":"2026-08-01T09:12:00Z","type":"checkin","date":"2026-08-01"}
{"id":"e7","ts":"2026-08-02T09:15:00Z","type":"settings_change","key":"daily_target_seconds","value":600}
`.trim();

const events: Event[] = jsonl
  .split("\n")
  .map((line) => JSON.parse(line));

const state = reduceEvents(events, questionItemMap);

console.log("readBlockIds:", state.readBlockIds);
console.log("itemStates:", state.itemStates);
console.log("checkinDates:", state.checkinDates);
console.log("wrongQuestionIdByItemId:", state.wrongQuestionIdByItemId);
console.log("dailyTargetSeconds:", state.dailyTargetSeconds);
