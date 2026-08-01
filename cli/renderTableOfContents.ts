import type { TocEntry } from "../core/tableOfContents.js";

/**
 * 把目录列表画成终端文本，当前所在小节前面画一个箭头、行尾标"you are here
 * today"——currentSectionPath 为 null（书已经读完）时不画箭头，纯列目录。
 */
export function renderTableOfContents(
  toc: readonly TocEntry[],
  currentSectionPath: readonly string[] | null,
): string {
  const currentKey = currentSectionPath?.join("/");

  return toc
    .map((entry) => {
      const key = entry.sectionPath.join("/");
      const label = entry.sectionPath.at(-1);
      const isCurrent = key === currentKey;
      const marker = isCurrent ? "→" : " ";
      const suffix = isCurrent ? "  (you are here today)" : "";
      return `${marker} ${label}  ${entry.sectionTitle}${suffix}`;
    })
    .join("\n");
}
