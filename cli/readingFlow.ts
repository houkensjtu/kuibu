import type { Block } from "../schema/types/pack.js";

export interface ReadingFlowDeps {
  /** 一次性展示今天所有 block 的正文，不做任何暂停。 */
  showBlocks: (blocks: readonly Block[]) => void;
  /** 展示完之后，等用户表示"读完了"（按 Enter，或 q 退出）才 resolve。 */
  waitUntilDone: () => Promise<void>;
  /** 每个 block 分摊到的秒数算出来后回调一次，调用方负责把它写成 block_read 事件。 */
  onBlockRead: (blockId: string, seconds: number) => void;
  /** 注入的时钟，默认 Date.now；测试时传固定序列。 */
  now?: () => number;
}

/**
 * 一次性呈现今天要读的全部 block（2026-08 修订：不再逐块暂停/进出 pager，
 * 见 docs/DESIGN.md §7.4），只在"全部展示完"到"用户表示读完"之间量一次
 * 总耗时，再按每个 block 的 est_seconds 占比分摊——用户读得快慢是整体的，
 * 分摊只是为了让 block_read 事件仍然一个 block 一条、总和仍然等于真实耗时
 * （末尾那个 block 兜底吸收四舍五入的误差，保证分摊总和分毫不差地等于总耗时）。
 */
export async function runReadingFlow(
  blocks: readonly Block[],
  { showBlocks, waitUntilDone, onBlockRead, now = Date.now }: ReadingFlowDeps,
): Promise<void> {
  if (blocks.length === 0) return;

  showBlocks(blocks);
  const startedAt = now();
  await waitUntilDone();
  const totalSeconds = Math.max(0, Math.round((now() - startedAt) / 1000));

  const totalEstSeconds = blocks.reduce((sum, b) => sum + b.est_seconds, 0);
  let allocated = 0;

  blocks.forEach((block, index) => {
    const isLast = index === blocks.length - 1;
    let seconds: number;
    if (isLast) {
      seconds = totalSeconds - allocated;
    } else {
      const share = totalEstSeconds > 0 ? block.est_seconds / totalEstSeconds : 1 / blocks.length;
      seconds = Math.round(totalSeconds * share);
      allocated += seconds;
    }
    onBlockRead(block.id, seconds);
  });
}
