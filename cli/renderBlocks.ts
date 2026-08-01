import type { Block } from "../schema/types/pack.js";

/**
 * 章节号放在标题左边、按层级拼起来，让人一眼看出"第几章 › 第几节 › 第几小节"，
 * 而不是像以前那样把一串 "1 / 1.1 / 1.1.1" 塞在标题右边的括号里，容易被忽略。
 * 只有第一级（章）给出"Chapter"字样，之后的级别本身就是带小数点的层级编号，
 * 不需要再逐级加"Section"/"Subsection"这类词。
 */
export function renderSectionHeader(sectionPath: readonly string[], sectionTitle: string): string {
  const [chapter, ...rest] = sectionPath;
  const pathLabel = [`Chapter ${chapter}`, ...rest].join(" › ");
  return `${pathLabel}  ${sectionTitle}`;
}

/**
 * 把今天要读的所有 block 正文一次性打印出来，不做任何暂停——真人终端本来就能
 * 自己滚动翻看，不需要再套一层 pager 逐块暂停（2026-08 修订，取代旧的
 * cli/pager.ts；见 docs/DESIGN.md §7.4）。
 */
export function printBlocks(blocks: readonly Block[]): void {
  for (const block of blocks) {
    console.log(renderSectionHeader(block.section_path, block.section_title));
    console.log();
    console.log(block.content_md);
    console.log();
  }
}
