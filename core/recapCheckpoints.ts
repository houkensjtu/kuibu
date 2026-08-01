import { packSession } from "./sessionPacker.js";
import type { Block, RecapCheckpoint } from "../schema/types/pack.js";

/**
 * 构建期用：把整本书按固定的每日时长目标反复打包（复用 packSession 本身，
 * 不是另起一套逻辑），算出"如果严格按这个节奏一天不落地读，第几个 block
 * 读完时正好是一天的终点"——这些终点就是回顾内容的自然切分单位。
 *
 * 这个"每日固定时长"假设只用来决定切分粒度（避免每个 block 都单独写一条
 * 回顾，那也太碎），不代表运行时真的要求用户按这个节奏读——真正的回顾
 * 查找（见 findApplicableRecapCheckpoint）按累计读了多少个 block 定位，
 * 用户实际节奏跟这个假设不一致也不会出错，见 docs/DESIGN.md 相关章节。
 */
export function computeCheckpointBoundaries(
  blocks: readonly Block[],
  targetSeconds: number,
): number[] {
  const boundaries: number[] = [];
  const readBlockIds = new Set<string>();

  while (readBlockIds.size < blocks.length) {
    const packed = packSession({ blocks, readBlockIds, targetSeconds });
    if (packed.length === 0) break; // 安全兜底：正常情况下 packSession 只要还有剩余就至少选一个

    for (const block of packed) readBlockIds.add(block.id);
    boundaries.push(readBlockIds.size);
  }

  return boundaries;
}

/**
 * 运行时用：给定用户实际累计读过的 block 数，找出"不超过这个进度"里最靠后
 * 的那条回顾——不管用户实际节奏跟构建期假设的每日时长差多少，这个查找永远
 * 是按真实累计进度定位，不会因为用户读得快/慢/中途调整目标而对不上。
 * 一个 block 都没读过（第一天）时没有任何回顾适用，返回 null。
 */
export function findApplicableRecapCheckpoint(
  checkpoints: readonly RecapCheckpoint[],
  readBlockCount: number,
): RecapCheckpoint | null {
  let best: RecapCheckpoint | null = null;
  for (const checkpoint of checkpoints) {
    if (checkpoint.through_block_count <= readBlockCount) {
      if (best === null || checkpoint.through_block_count > best.through_block_count) {
        best = checkpoint;
      }
    }
  }
  return best;
}
