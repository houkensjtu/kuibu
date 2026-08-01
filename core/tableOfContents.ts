import type { Block, SectionHeading } from "../schema/types/pack.js";

export type TocRow =
  | { kind: "heading"; sectionPath: string[]; sectionTitle: string }
  | { kind: "leaf"; sectionPath: string[]; sectionTitle: string };

/**
 * 内容包里出现过的所有小节 + 章/节标题，按 blocks 原有顺序、按层级穿插排列——
 * 每遇到一个还没出现过的章/节前缀（用 sectionHeadings 查得到标题的那种），
 * 先插一行 heading，再插叶子小节自己那一行。假设 blocks 已经按 seq 排好序
 * （内容包的既定约定），这里不重新排序。
 *
 * 章节引言的合成路径（如 ["1","1.0","1.0.1"]）里的 "1.0" 在 sectionHeadings
 * 里查不到（它不是原书真实编号），自然不会插 heading 行——不需要特殊处理。
 */
export function buildTableOfContents(
  blocks: readonly Block[],
  sectionHeadings: readonly SectionHeading[],
): TocRow[] {
  const headingTitleByPath = new Map(
    sectionHeadings.map((h) => [h.path.join("/"), h.title]),
  );
  const seenHeadingPaths = new Set<string>();
  const seenLeafPaths = new Set<string>();
  const rows: TocRow[] = [];

  for (const block of blocks) {
    const leafKey = block.section_path.join("/");
    if (seenLeafPaths.has(leafKey)) continue;
    seenLeafPaths.add(leafKey);

    for (let depth = 1; depth < block.section_path.length; depth++) {
      const prefix = block.section_path.slice(0, depth);
      const prefixKey = prefix.join("/");
      if (seenHeadingPaths.has(prefixKey)) continue;

      const title = headingTitleByPath.get(prefixKey);
      if (title === undefined) continue; // 合成路径（如 "1.0"），不是真实章/节

      seenHeadingPaths.add(prefixKey);
      rows.push({ kind: "heading", sectionPath: prefix, sectionTitle: title });
    }

    rows.push({
      kind: "leaf",
      sectionPath: block.section_path,
      sectionTitle: block.section_title,
    });
  }

  return rows;
}
