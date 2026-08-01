import type { Block } from "../schema/types/pack.js";

export interface TocEntry {
  sectionPath: string[];
  sectionTitle: string;
}

/**
 * 内容包里出现过的所有小节，按 blocks 原有顺序去重——一个小节可能横跨好几个
 * block，只在第一次遇到时记一条目录项。假设 blocks 已经按 seq 排好序
 * （内容包的既定约定），这里不重新排序。
 */
export function buildTableOfContents(blocks: readonly Block[]): TocEntry[] {
  const seen = new Set<string>();
  const toc: TocEntry[] = [];

  for (const block of blocks) {
    const key = block.section_path.join("/");
    if (seen.has(key)) continue;
    seen.add(key);
    toc.push({ sectionPath: block.section_path, sectionTitle: block.section_title });
  }

  return toc;
}
