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
 * 贪心断行：把一段（不含换行符的）文本按空格切词，尽量塞满每行，超过
 * maxWidth 才换到下一行。单个词本身比 maxWidth 还长时不强行截断（不影响
 * 阅读，简单起见不处理这种边界情况）。
 */
function wordWrap(text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length > maxWidth && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

/**
 * 给正文加统一的缩进前缀，深度比这个 block 自己的小节标题再深一级（呼应
 * "..." 续读提示用的同一个缩进量），让正文在视觉上"挂在"它所属的标题下面。
 *
 * 光给每行开头加前缀不够——`content_md` 里一个段落本来就是不含换行符的
 * 一整行长文本，终端会自己在屏幕宽度处折行，折行后续接的部分不会带缩进
 * （表现出来就是"只有第一行缩进，后面又顶头了"）。所以这里需要真正按
 * `width` 手动断行、给断出来的每一行都加前缀，而不是指望终端的自动折行。
 *
 * 代码块内容原样保留、不参与断行（重新折行会破坏代码本身的语义/可读性），
 * 但 ```scheme / ``` 这两行围栏标记本身不打印——纯文本终端不认识 Markdown，
 * 这两行光秃秃地杵在那里既不高亮也不成框，只是噪音（2026-08 用户反馈）。
 * 开头围栏换成一行明说"接下来是代码"的纯文本提示（有语言标注就带上，如
 * "Code (scheme):"），兼容任何终端/字体，不依赖 ANSI 颜色或 Unicode 画框；
 * 结尾围栏直接省略，代码结束后原有的空行本身就足够当作分隔。空行不加
 * 前缀，避免留下没意义的行尾空白。
 */
export function indentContent(content: string, indent: string, width = 80): string {
  const wrapWidth = Math.max(20, width - indent.length);
  let inCodeFence = false;
  const output: string[] = [];

  for (const line of content.split("\n")) {
    const fenceMatch = line.trim().match(/^```(\w+)?/);
    if (fenceMatch) {
      if (!inCodeFence) {
        const label = fenceMatch[1] ? `Code (${fenceMatch[1]}):` : "Code:";
        output.push(indent + label);
      }
      inCodeFence = !inCodeFence;
    } else if (line === "") {
      output.push(line);
    } else if (inCodeFence) {
      output.push(indent + line);
    } else {
      for (const wrapped of wordWrap(line, wrapWidth)) {
        output.push(indent + wrapped);
      }
    }
  }
  return output.join("\n");
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
    console.log(indentContent(block.content_md, contentIndent, process.stdout.columns ?? 80));
    console.log();

    previousPath = block.section_path;
  });
}
