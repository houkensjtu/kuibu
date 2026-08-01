import type { Block } from "../schema/types/pack.js";

/**
 * 剩余未读内容按当前每日目标时长估算还要读几天，向上取整——哪怕只剩 1 秒
 * 的内容也该算成"还有 1 天"，不能因为四舍五入把"其实还没读完"抹成 0 天。
 */
export function estimateDaysRemaining(
  blocks: readonly Block[],
  readBlockIds: ReadonlySet<string>,
  dailyTargetSeconds: number,
): number {
  const remainingSeconds = blocks
    .filter((b) => !readBlockIds.has(b.id))
    .reduce((sum, b) => sum + b.est_seconds, 0);

  if (remainingSeconds <= 0) return 0;
  return Math.ceil(remainingSeconds / dailyTargetSeconds);
}
