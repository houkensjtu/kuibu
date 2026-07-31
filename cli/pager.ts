import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import type { Block } from "../schema/types/pack.js";

function renderBlock(block: Block): string {
  const location = block.section_path.join(" / ");
  return `${block.section_title}（${location}）\n\n${block.content_md}\n`;
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
 */
export async function showBlockInPagerOrFallback(block: Block): Promise<void> {
  const text = renderBlock(block);
  const pagerCmd = process.env.PAGER || "less";

  if (tryPager(text, pagerCmd)) return;

  console.log(text);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("（未找到 pager，已直接打印正文）读完了按 Enter 继续...");
  rl.close();
}
