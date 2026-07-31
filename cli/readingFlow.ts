import type { Block } from "../schema/types/pack.js";

export interface ReadingFlowDeps {
  /** 呈现一个 block 并且一直等到用户表示"读完了"才 resolve（pager 退出 / 按 Enter）。 */
  showBlock: (block: Block) => Promise<void> | void;
  /** 每读完一个 block 就回调一次，调用方负责把它写成 block_read 事件。 */
  onBlockRead: (blockId: string, seconds: number) => void;
  /** 注入的时钟，默认 Date.now；测试时传固定序列。 */
  now?: () => number;
}

/**
 * 依次呈现今天要读的 block，用"进入 showBlock 到它 resolve"作为计时锚点
 * （对应 pager 的进出，或者降级模式下打印正文到按 Enter）。
 */
export async function runReadingFlow(
  blocks: readonly Block[],
  { showBlock, onBlockRead, now = Date.now }: ReadingFlowDeps,
): Promise<void> {
  for (const block of blocks) {
    const startedAt = now();
    await showBlock(block);
    const seconds = Math.max(0, Math.round((now() - startedAt) / 1000));
    onBlockRead(block.id, seconds);
  }
}
