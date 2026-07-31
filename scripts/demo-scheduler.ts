import { leitnerScheduler, BOX_INTERVAL_DAYS } from "../core/scheduler.js";
import type { ItemState } from "../core/scheduler.js";

console.log("box 间隔表:", BOX_INTERVAL_DAYS);
console.log();

let state: ItemState | undefined;
let today = "2026-08-01";

const answers = [true, true, true, true, false, true];

for (const correct of answers) {
  state = leitnerScheduler.onAnswer("k0001", correct, today, state);
  console.log(
    `${today} 答题${correct ? "正确" : "错误"} -> box ${state.box}（${BOX_INTERVAL_DAYS[state.box]}天）, 下次到期 ${state.dueDate}`,
  );
  today = state.dueDate; // 假装刚好在到期日当天又复习了一次
}
