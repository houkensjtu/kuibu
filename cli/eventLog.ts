import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Event } from "../schema/types/events.js";

/**
 * 追加一条事件到日志文件末尾并立即落盘（铁律 5：append-only，崩溃最多丢最后一行）。
 * appendFileSync 每次调用都会独立 open/write/close，不依赖调用方记得 flush。
 */
export function appendEvent(logPath: string, event: Event): void {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, JSON.stringify(event) + "\n", "utf-8");
}

/**
 * 读取整份事件日志。文件不存在时视为"还没有任何记录"，返回空数组而不是报错
 * ——这是全新用户第一次运行 kuibu 时的正常状态。
 */
export function readEvents(logPath: string): Event[] {
  if (!existsSync(logPath)) return [];

  return readFileSync(logPath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Event);
}

/**
 * 整份覆盖写入事件日志——唯一会用到它的地方是 import（合并两份日志后落盘），
 * 这是刻意打破 append-only 的例外，日常流程（session_start/block_read/...）
 * 一律走 appendEvent。
 */
export function writeEvents(logPath: string, events: readonly Event[]): void {
  mkdirSync(dirname(logPath), { recursive: true });
  const content = events.map((event) => JSON.stringify(event)).join("\n");
  writeFileSync(logPath, content.length > 0 ? content + "\n" : "", "utf-8");
}
