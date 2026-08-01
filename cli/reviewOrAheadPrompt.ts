import type { LineReader } from "./lineReader.js";

export type ReopenChoice = "review" | "ahead";

/**
 * 今天已经打过卡、又重新打开时问用户想做什么：复习今天读过的内容（原样重放，
 * 不产生新事件），还是超前阅读（照常打包下一批未读内容，读完答完题可能会
 * 再触发一次同一天的 checkin，无害——checkinDates 是去重的 Set）。
 * 除了显式选 "2" 以外一律当作复习——不确定就选不推进阅读进度的那个选项更安全。
 */
export async function askReviewOrAhead(lineReader: LineReader): Promise<ReopenChoice> {
  process.stdout.write(
    "You've already checked in today. [1] Review today's content again  [2] Read ahead (tomorrow's content)\nChoice (default 1): ",
  );
  const answer = (await lineReader.readLine()).trim();
  return answer === "2" ? "ahead" : "review";
}
