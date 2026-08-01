import { spawnSync } from "node:child_process";
import type { LineReader } from "./lineReader.js";
import { readLineOrQuit } from "./readLineOrQuit.js";
import type { Block } from "../schema/types/pack.js";

function renderBlock(block: Block): string {
  const location = block.section_path.join(" / ");
  return `${block.section_title} (${location})\n\n${block.content_md}\n`;
}

/** 尝试把 text 交给系统 pager 显示；返回 pager 是否真的跑起来了。 */
export function tryPager(text: string, pagerCmd: string): boolean {
  const result = spawnSync(pagerCmd, ["-R"], {
    input: text,
    stdio: ["pipe", "inherit", "inherit"],
  });
  return result.error === undefined;
}

/**
 * 用系统 pager（默认 less，可用 PAGER 环境变量覆盖）显示一个 block；
 * pager 不可用时（比如没装 less 的 Windows 终端）降级为直接打印正文，
 * 按 Enter 表示读完——保持"呈现到用户表示读完"这同一个计时锚点。
 *
 * 降级路径接收一个外部传入、贯穿整个阅读环节的 LineReader（不是每次自己
 * new 一个），原因同 answerPrompt.ts：一本书如果没装 pager，会一路降级
 * 好几个 block，每次都现造一个新的 readline.Interface 问一次，跟"同一个
 * Interface 连续 question() 两次"是同一类坑的另一种触发方式。
 */
export async function showBlockInPagerOrFallback(
  block: Block,
  lineReader: LineReader,
): Promise<void> {
  const text = renderBlock(block);
  const pagerCmd = process.env.PAGER || "less";

  if (tryPager(text, pagerCmd)) return;

  console.log(text);
  process.stdout.write("(no pager found, printed directly) Press Enter when done reading (or 'q' to quit)...");
  await readLineOrQuit(lineReader);
}
