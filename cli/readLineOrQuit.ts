import type { LineReader } from "./lineReader.js";

/**
 * 唯一约定的主动退出方式是输入 "q"（大小写不敏感）。这个判定统一放在这里，
 * 所有交互提示（阅读降级/答题/目标调整/复习-超前选择）一律经过这层包装，
 * 而不是各自直接调 lineReader.readLine()——这样"q 退出"这条规则只需要写
 * 一次，不会有哪个提示点漏掉，也不会有哪次输入把进程意外带崩。
 */
export class UserQuit extends Error {
  constructor() {
    super("user typed q to quit");
    this.name = "UserQuit";
  }
}

export async function readLineOrQuit(lineReader: LineReader): Promise<string> {
  const raw = await lineReader.readLine();
  if (raw.trim().toLowerCase() === "q") {
    throw new UserQuit();
  }
  return raw;
}
