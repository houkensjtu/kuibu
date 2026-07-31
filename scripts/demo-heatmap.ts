import { buildHeatmap, computeCurrentStreak } from "../core/heatmap.js";

const checkinDates = new Set([
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-31", // 2026-07-30 缺一天
  "2026-08-01",
]);

const today = "2026-08-01";
const cells = buildHeatmap(checkinDates, today, 14);

console.log(cells.map((c) => (c.checkedIn ? "■" : "·")).join(" "));
console.log(cells.map((c) => c.date.slice(5)).join(" "));
console.log(`当前连续打卡：${computeCurrentStreak(checkinDates, today)} 天`);
