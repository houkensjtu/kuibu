import { checkinDate } from "../core/checkinDate.js";

const moments: [string, Date][] = [
  ["凌晨 01:00", new Date(2026, 6, 31, 1, 0, 0)],
  ["凌晨 03:59", new Date(2026, 6, 31, 3, 59, 0)],
  ["凌晨 04:00", new Date(2026, 6, 31, 4, 0, 0)],
  ["晚上 22:30", new Date(2026, 6, 31, 22, 30, 0)],
];

for (const [label, ts] of moments) {
  console.log(`${ts.toLocaleString()}（${label}） -> 打卡日 ${checkinDate(ts)}`);
}
