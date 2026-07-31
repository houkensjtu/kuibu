import type { Block } from "../schema/types/pack.js";

export interface SessionPackerInput {
  /** 内容包里完整的、按 seq 排好序的 block 列表。 */
  blocks: readonly Block[];
  /** 已经读过的 block id（来自 reducer 折叠 block_read 事件得到的 readBlockIds）。 */
  readBlockIds: ReadonlySet<string>;
  /** 今天的阅读时长目标（秒）。 */
  targetSeconds: number;
}

/**
 * 从剩余（未读）block 里，按 seq 顺序打包出今天要读的 block 列表。
 *
 * 时长目标可能小于任何单个 block 的预估时长，为了保证"今天总能读点什么、
 * 不会打包出空列表"，只要还有剩余 block，至少会选中第一个——之后每加一块
 * 前才检查是否会超预算，超了就停止，已选中的不回退。
 */
export function packSession({
  blocks,
  readBlockIds,
  targetSeconds,
}: SessionPackerInput): Block[] {
  const remaining = blocks.filter((block) => !readBlockIds.has(block.id));

  const selected: Block[] = [];
  let cumulativeSeconds = 0;

  for (const block of remaining) {
    if (selected.length > 0 && cumulativeSeconds + block.est_seconds > targetSeconds) {
      break;
    }
    selected.push(block);
    cumulativeSeconds += block.est_seconds;
  }

  return selected;
}
