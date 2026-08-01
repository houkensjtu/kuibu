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
