import { shiftDateString } from "./checkinDate.js";

export interface HeatmapCell {
  date: string;
  checkedIn: boolean;
}

/** 生成以 today 为最后一天、连续 days 天的打卡格子，按日期升序排列。 */
export function buildHeatmap(
  checkinDates: ReadonlySet<string>,
  today: string,
  days = 30,
): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftDateString(today, -i);
    cells.push({ date, checkedIn: checkinDates.has(date) });
  }
  return cells;
}

/** 从 today 往前数，连续打卡了多少天（today 本身没打卡则是 0）。 */
export function computeCurrentStreak(
  checkinDates: ReadonlySet<string>,
  today: string,
): number {
  let streak = 0;
  let cursor = today;
  while (checkinDates.has(cursor)) {
    streak++;
    cursor = shiftDateString(cursor, -1);
  }
  return streak;
}
