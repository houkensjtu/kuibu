import type { Block } from "../schema/types/pack.js";

/** 剩余未读内容的总估计秒数——天数估计和分钟数估计共用这同一个计算。 */
export function computeRemainingSeconds(
  blocks: readonly Block[],
  readBlockIds: ReadonlySet<string>,
): number {
  return blocks
    .filter((b) => !readBlockIds.has(b.id))
    .reduce((sum, b) => sum + b.est_seconds, 0);
}

/**
 * 剩余未读内容按当前每日目标时长估算还要读几天，向上取整——哪怕只剩 1 秒
 * 的内容也该算成"还有 1 天"，不能因为四舍五入把"其实还没读完"抹成 0 天。
 */
export function estimateDaysRemaining(
  blocks: readonly Block[],
  readBlockIds: ReadonlySet<string>,
  dailyTargetSeconds: number,
): number {
  const remainingSeconds = computeRemainingSeconds(blocks, readBlockIds);
  if (remainingSeconds <= 0) return 0;
  return Math.ceil(remainingSeconds / dailyTargetSeconds);
}

/** 剩余未读内容总共大约还要读多少分钟——跟每日目标无关，纯粹是内容总量。 */
export function estimateMinutesRemaining(
  blocks: readonly Block[],
  readBlockIds: ReadonlySet<string>,
): number {
  return Math.round(computeRemainingSeconds(blocks, readBlockIds) / 60);
}
