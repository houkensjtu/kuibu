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
