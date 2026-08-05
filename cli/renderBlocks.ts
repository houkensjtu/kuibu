import type { Block, SectionHeading } from "../schema/types/pack.js";
import { displayWidth } from "./textWidth.js";

/**
 * 跟真书排版一样，只在章/节/小节号相对上一个 block 发生变化的那一级开始，
 * 才打印从那一级往下的标题行——同一小节里的连续 block 之间完全不重复标题。
 * 章一级*只有在编号是纯数字时*才带 "Chapter N" 前缀（如 "1" → "Chapter 1"）；
 * 非数字的顶层编号（比如乔布斯传的前言/尾声，section_path 是 "foreword"/
 * "afterword" 而不是数字）不属于"第几章"，不该被贴上 "Chapter" 标签——最初
 * 曾把前言按顺序编成 section_path "1"，跟第一章的 "1" 撞在一起变成"Chapter
 * 1"，用户反馈"前言就是前言，第一章才是 Chapter 1"，改成非数字编号 +
 * 跳过前缀来修（`pack-gen/scripts/split_sjobs.py` 的 `reorder_and_renumber`）。
 * 其余层级只写编号本身（如 "1.1"），靠缩进而不是重复的 "Chapter 1 › ..."
 * 前缀表达层级关系。中间层级（章、节）的标题文字来自 sectionHeadings；
 * 查不到（比如章节引言的合成路径 "1.0"）就跳过那一行，但仍然照常更新
 * previousPath，不影响后续 block 的层级比较。
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
    const isNumberedChapter = d === 0 && /^\d+$/.test(path[0]);
    const label = d === 0 ? (isNumberedChapter ? `Chapter ${path[0]}` : undefined) : path[d];
    const prefix = label === undefined ? "" : `${label}  `;
    lines.push(`${"  ".repeat(d)}${prefix}${title}`);
  }
  return lines;
}

interface WrapToken {
  text: string;
  /** 这个 token 前面原文有没有一个空格——决定重新拼行时要不要补回那个空格。 */
  spaceBefore: boolean;
}

/**
 * 把文本切成断行用的最小单元：每个 CJK 宽字符自成一个 token（中文本来就没有
 * 空格分词，字与字之间随处都能断行）；西文按空格切成一个个词，词内部不切
 * （比如英文人名/机构名的两个词之间可以断，但一个单词内部不断）。
 *
 * 用来修一个真实踩过的坑：乔布斯传里中英文混排很常见，比如"美国国家航空
 * 航天局埃姆斯研究中心(NASA Ames Research Center)"——旧版 wordWrap 只按空格
 * 切词，一大段没有空格的中文会被当成*一个词*（因为中间一个空格都没有），
 * 这个超长词硬塞进一行（不受 maxWidth 约束，见下面 wrapTokens 的处理），
 * 直到遇到第一个空格（往往就在括号里的英文词组中间）才第一次有机会断行，
 * 表现出来就是"中文一大段不换行，英文词组却莫名其妙从中间断开"。改成
 * 逐字拆中文之后，中文本身随时能在合适的宽度断行，不会再把一大段中文和
 * 紧跟着的英文词组粘成一个断不开的超长 token。
 */
function tokenize(text: string): WrapToken[] {
  const tokens: WrapToken[] = [];
  let buffer = "";
  let spaceBefore = false;

  const flush = () => {
    if (buffer.length > 0) {
      tokens.push({ text: buffer, spaceBefore });
      buffer = "";
      spaceBefore = false;
    }
  };

  for (const ch of text) {
    if (ch === " ") {
      flush();
      spaceBefore = true;
    } else if (displayWidth(ch) === 2) {
      flush();
      tokens.push({ text: ch, spaceBefore });
      spaceBefore = false;
    } else {
      buffer += ch;
    }
  }
  flush();
  return tokens;
}

/**
 * 贪心断行：尽量塞满每行，超过 maxWidth（终端显示列数，不是字符数——中日韩
 * 宽字符占两列，见 `textWidth.ts`）才换到下一行。单个 token 本身比 maxWidth
 * 还长时不强行截断（不影响阅读，简单起见不处理这种边界情况）。
 */
function wordWrap(text: string, maxWidth: number): string[] {
  const tokens = tokenize(text);
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;

  for (const token of tokens) {
    const sep = token.spaceBefore && current.length > 0 ? " " : "";
    const candidateWidth = currentWidth + displayWidth(sep) + displayWidth(token.text);
    if (candidateWidth > maxWidth && current.length > 0) {
      lines.push(current);
      current = token.text;
      currentWidth = displayWidth(token.text);
    } else {
      current = current + sep + token.text;
      currentWidth = candidateWidth;
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
 * 代码本身上下各加一条 `---` 边界线，宽度跟着代码内容本身走（取代码块里
 * 最长一行的长度），不拉满整个屏幕宽度——太宽会跟分页/分节的横线混淆
 * （2026-08 用户反馈）。空行不加前缀，避免留下没意义的行尾空白。
 */
export function indentContent(content: string, indent: string, width = 80): string {
  const wrapWidth = Math.max(20, width - indent.length);
  let inCodeFence = false;
  let codeLabel = "";
  let codeLines: string[] = [];
  const output: string[] = [];

  const flushCodeBlock = () => {
    const codeWidth = codeLines.reduce((max, line) => Math.max(max, line.length), 1);
    const border = indent + "-".repeat(codeWidth);
    output.push(indent + codeLabel);
    output.push(border);
    for (const line of codeLines) output.push(indent + line);
    output.push(border);
    codeLines = [];
  };

  for (const line of content.split("\n")) {
    const fenceMatch = line.trim().match(/^```(\w+)?/);
    if (fenceMatch) {
      if (inCodeFence) {
        flushCodeBlock();
      } else {
        codeLabel = fenceMatch[1] ? `Code (${fenceMatch[1]}):` : "Code:";
      }
      inCodeFence = !inCodeFence;
    } else if (inCodeFence) {
      codeLines.push(line);
    } else if (line === "") {
      output.push(line);
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
