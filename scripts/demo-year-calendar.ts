import { buildYearCalendar } from "../core/yearCalendar.js";
import { renderYearCalendar } from "../cli/renderYearCalendar.js";
import { computeCurrentStreak } from "../core/streak.js";

const checkinDates = new Set([
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-31", // 2026-07-30 缺一天
  "2026-08-01",
]);

const today = "2026-08-01";
const calendar = buildYearCalendar(checkinDates, Number(today.slice(0, 4)));

console.log(renderYearCalendar(calendar));
console.log(`当前连续打卡：${computeCurrentStreak(checkinDates, today)} 天`);
