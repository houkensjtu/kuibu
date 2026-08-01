import type { TocRow } from "../core/tableOfContents.js";

/**
 * 把目录（章/节标题 + 叶子小节）画成终端文本：按 sectionPath 的深度缩进
 * （章不缩进，节缩进一级，叶子小节再缩进一级），一眼看出层级关系。当前所在
 * 小节前面画一个箭头、行尾标"you are here today"——只有叶子小节会被标注，
 * 章/节标题行本身不是"当前位置"。currentSectionPath 为 null（书已读完）时
 * 不画箭头，纯列目录。
 */
export function renderTableOfContents(
  toc: readonly TocRow[],
  currentSectionPath: readonly string[] | null,
): string {
  const currentKey = currentSectionPath?.join("/");

  return toc
    .map((row) => {
      const key = row.sectionPath.join("/");
      const label = row.sectionPath.at(-1);
      const isCurrent = row.kind === "leaf" && key === currentKey;
      const marker = isCurrent ? "→" : " ";
      const indent = "  ".repeat(row.sectionPath.length - 1);
      const suffix = isCurrent ? "  (you are here today)" : "";
      return `${marker} ${indent}${label}  ${row.sectionTitle}${suffix}`;
    })
    .join("\n");
}
