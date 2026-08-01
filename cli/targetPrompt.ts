import type { LineReader } from "./lineReader.js";

/** Parses raw user input into a positive integer number of minutes, falling back to a default. */
export function parseMinutesInput(raw: string, defaultMinutes: number): number {
  const trimmed = raw.trim();
  if (trimmed === "") return defaultMinutes;

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultMinutes;
}

/** Asks the user for their daily reading target in minutes, defaulting on empty/invalid input. */
export async function askDailyTargetMinutes(
  lineReader: LineReader,
  defaultMinutes: number,
): Promise<number> {
  process.stdout.write(
    `How many minutes do you want to read per day? (default ${defaultMinutes}, press Enter to accept): `,
  );
  const raw = await lineReader.readLine();
  return parseMinutesInput(raw, defaultMinutes);
}

export type TimeSpentClassification = "under" | "over" | "on-track";

// 阈值本身没有一个"标准答案"，选 70%/130% 是一个合理但随意的判断——
// 差得不多（比如 target 12 分钟、实际 10 分钟）不值得每天都追问。
const UNDER_RATIO = 0.7;
const OVER_RATIO = 1.3;

/** 今天实际花的阅读时间相对目标算"差不多/明显少/明显多"，纯反馈用，不影响打卡判定。 */
export function classifyTimeSpent(
  actualSeconds: number,
  targetSeconds: number,
): TimeSpentClassification {
  if (targetSeconds <= 0) return "on-track";
  if (actualSeconds < targetSeconds * UNDER_RATIO) return "under";
  if (actualSeconds > targetSeconds * OVER_RATIO) return "over";
  return "on-track";
}

/**
 * 问用户要不要调整明天的目标时长；不要就返回 null，什么也不改。
 * "increase"/"decrease" 只是问题的措辞方向，用户回答 y 之后可以自己填任意数字
 * （不是只能往那个方向调），因为最终真正想要几分钟只有用户自己知道。
 */
export async function askAdjustTarget(
  lineReader: LineReader,
  direction: "increase" | "decrease",
  currentMinutes: number,
): Promise<number | null> {
  process.stdout.write(`Would you like to ${direction} tomorrow's reading target? (y/N): `);
  const answer = (await lineReader.readLine()).trim().toLowerCase();
  if (answer !== "y" && answer !== "yes") return null;

  process.stdout.write(`New daily target in minutes (currently ${currentMinutes}): `);
  const raw = await lineReader.readLine();
  return parseMinutesInput(raw, currentMinutes);
}
