import { shiftDateString } from "./checkinDate.js";

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
