import type { Block, SectionHeading } from "../../../schema/types/pack";

export interface SectionHeaderLine {
  depth: number;
  /** "Chapter 1" for a numbered top-level path, the raw path segment (e.g. "1.1") for deeper levels, undefined for non-numbered top levels (foreword/afterword-style books). */
  label?: string;
  title: string;
}

/**
 * Same idea as cli/renderBlocks.ts's computeHeaderLines -- only emit the
 * header levels whose path segment changed since the previous block, book
 * typesetting style, not "full breadcrumb on every block" -- but returns
 * structured data instead of pre-formatted terminal strings, since the web
 * brief (pitfall #1) says the CLI's rendering layer is not to be ported
 * verbatim: here that means <h2>/<h3>/<h4> elements picked by `depth`, not
 * printed lines with hand-built indentation.
 */
export function computeSectionHeaders(
  previousPath: readonly string[],
  block: Pick<Block, "section_path" | "section_title">,
  sectionHeadings: readonly SectionHeading[],
): SectionHeaderLine[] {
  const titleByPath = new Map(sectionHeadings.map((h) => [h.path.join("/"), h.title]));
  const path = block.section_path;

  let depth = 0;
  while (depth < previousPath.length && depth < path.length && previousPath[depth] === path[depth]) {
    depth++;
  }

  const lines: SectionHeaderLine[] = [];
  for (let d = depth; d < path.length; d++) {
    const isLeaf = d === path.length - 1;
    const title = isLeaf ? block.section_title : titleByPath.get(path.slice(0, d + 1).join("/"));
    if (title === undefined) continue;

    const isNumberedChapter = d === 0 && /^\d+$/.test(path[0]);
    const label = d === 0 ? (isNumberedChapter ? `Chapter ${path[0]}` : undefined) : path[d];
    lines.push({ depth: d, label, title });
  }
  return lines;
}

/** Same rule the CLI applies: a section is "resumed mid-way" if some other block sharing the first today-block's leaf section was already read on a previous day. */
export function isResumingMidSection(
  allBlocks: readonly Pick<Block, "id" | "section_path">[],
  firstTodayBlock: Pick<Block, "id" | "section_path">,
  readBlockIds: ReadonlySet<string>,
): boolean {
  const path = firstTodayBlock.section_path.join("/");
  return allBlocks.some(
    (b) => b.id !== firstTodayBlock.id && b.section_path.join("/") === path && readBlockIds.has(b.id),
  );
}
