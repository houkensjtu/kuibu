import type { Interface } from "node:readline/promises";

/** Parses raw user input into a positive integer number of minutes, falling back to a default. */
export function parseMinutesInput(raw: string, defaultMinutes: number): number {
  const trimmed = raw.trim();
  if (trimmed === "") return defaultMinutes;

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultMinutes;
}

/** Asks the user for their daily reading target in minutes, defaulting on empty/invalid input. */
export async function askDailyTargetMinutes(
  rl: Interface,
  defaultMinutes: number,
): Promise<number> {
  const raw = await rl.question(
    `How many minutes do you want to read per day? (default ${defaultMinutes}, press Enter to accept): `,
  );
  return parseMinutesInput(raw, defaultMinutes);
}
