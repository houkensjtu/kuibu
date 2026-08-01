import type { Block } from "../schema/types/pack.js";

export interface ProgressInfo {
  /** 最后一个"全部读完"的小节路径（如 ["1","1.1","1.1.3"]）；一个小节都没读完则为 null。 */
  lastCompletedSectionPath: string[] | null;
  /** 整个内容包的阅读进度（0-100，四舍五入）。 */
  percentRead: number;
}

/**
 * 小节 + 整包百分比同时算出来（DESIGN.md §6.3），假设 blocks 已经按 seq 排好序
 * ——内容包本身的约定就是这样，这里不重新排序。
 */
export function computeProgress(
  blocks: readonly Block[],
  readBlockIds: ReadonlySet<string>,
): ProgressInfo {
  if (blocks.length === 0) {
    return { lastCompletedSectionPath: null, percentRead: 0 };
  }

  const readCount = blocks.filter((b) => readBlockIds.has(b.id)).length;
  const percentRead = Math.round((readCount / blocks.length) * 100);

  const sections = new Map<string, Block[]>();
  for (const block of blocks) {
    const key = block.section_path.join("/");
    const existing = sections.get(key);
    if (existing) {
      existing.push(block);
    } else {
      sections.set(key, [block]);
    }
  }

  let lastCompletedSectionPath: string[] | null = null;
  for (const sectionBlocks of sections.values()) {
    if (sectionBlocks.every((b) => readBlockIds.has(b.id))) {
      lastCompletedSectionPath = sectionBlocks[0].section_path;
    }
  }

  return { lastCompletedSectionPath, percentRead };
}

export interface CurrentPosition {
  sectionPath: string[];
  sectionTitle: string;
}

/**
 * "当前位置" = 第一个还没读过的 block 所在的小节——跟 lastCompletedSectionPath
 * 不是一回事：一个小节只读了一半还不算"完成"，但用户已经身处其中了，
 * "当前在哪" 应该反映这个，而不是停留在上一个真正读完的小节。
 * 假设 blocks 已经按 seq 排好序（内容包的既定约定），这里不重新排序。
 * 全部读完时返回 null。
 */
export function computeCurrentPosition(
  blocks: readonly Block[],
  readBlockIds: ReadonlySet<string>,
): CurrentPosition | null {
  const nextBlock = blocks.find((b) => !readBlockIds.has(b.id));
  if (!nextBlock) return null;
  return { sectionPath: nextBlock.section_path, sectionTitle: nextBlock.section_title };
}
