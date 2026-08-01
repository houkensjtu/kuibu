import type { Block, SectionHeading } from "../schema/types/pack.js";

/**
 * 跟真书排版一样，只在章/节/小节号相对上一个 block 发生变化的那一级开始，
 * 才打印从那一级往下的标题行——同一小节里的连续 block 之间完全不重复标题。
 * 章一级永远带 "Chapter N" 前缀，其余层级只写编号本身（如 "1.1"），靠缩进
 * 而不是重复的 "Chapter 1 › ..." 前缀表达层级关系。中间层级（章、节）的标题
 * 文字来自 sectionHeadings；查不到（比如章节引言的合成路径 "1.0"）就跳过
 * 那一行，但仍然照常更新 previousPath，不影响后续 block 的层级比较。
 */
export function computeHeaderLines(
  previousPath: readonly string[],
  block: Pick<Block, "section_path" | "section_title">,
  sectionHeadings: readonly SectionHeading[],
): string[] {
  const headingTitleByPath = new Map(sectionHeadings.map((h) => [h.path.join("/"), h.title]));
  const path = block.section_path;

  let depth = 0;
  while (depth < previousPath.length && depth < path.length && previousPath[depth] === path[depth]) {
    depth++;
  }

  const lines: string[] = [];
  for (let d = depth; d < path.length; d++) {
    const isLeaf = d === path.length - 1;
    const title = isLeaf ? block.section_title : headingTitleByPath.get(path.slice(0, d + 1).join("/"));
    if (title === undefined) continue;
    const label = d === 0 ? `Chapter ${path[0]}` : path[d];
    lines.push(`${"  ".repeat(d)}${label}  ${title}`);
  }
  return lines;
}

/**
 * 给正文每一行加统一的缩进前缀，深度比这个 block 自己的小节标题再深一级
 * （呼应 "..." 续读提示用的同一个缩进量），让正文在视觉上"挂在"它所属的
 * 标题下面。空行不加前缀，避免留下没意义的行尾空白；代码块（```scheme ...```）
 * 里的每一行也会被整体右移，但只是加一个恒定前缀，代码本身的相对缩进不受影响。
 */
export function indentContent(content: string, indent: string): string {
  return content
    .split("\n")
    .map((line) => (line === "" ? line : indent + line))
    .join("\n");
}

/**
 * 把今天要读的所有 block 正文一次性打印出来，不做任何暂停——真人终端本来就能
 * 自己滚动翻看，不需要再套一层 pager 逐块暂停（2026-08 修订，取代旧的
 * cli/pager.ts；见 docs/DESIGN.md §7.4）。
 *
 * `resumingMidSection`：今天第一个 block 所在的小节，是不是之前某天已经读过
 * 一部分（断在小节中间）——是的话在第一个 block 的标题下面补一行 "..."，
 * 代表"这里之前还有内容，不重复打印"，而不是让读者误以为这个小节是从头开始的。
 */
export function printBlocks(
  blocks: readonly Block[],
  sectionHeadings: readonly SectionHeading[],
  options: { resumingMidSection?: boolean } = {},
): void {
  let previousPath: readonly string[] = [];

  blocks.forEach((block, index) => {
    const headerLines = computeHeaderLines(previousPath, block, sectionHeadings);
    for (const line of headerLines) {
      console.log(line);
    }

    const contentIndent = "  ".repeat(block.section_path.length);

    if (index === 0 && options.resumingMidSection && headerLines.length > 0) {
      console.log(`${contentIndent}...`);
    }

    if (headerLines.length > 0) {
      console.log();
    }
    console.log(indentContent(block.content_md, contentIndent));
    console.log();

    previousPath = block.section_path;
  });
}
