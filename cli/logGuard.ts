import { findLoggedBookId } from "../core/reducer.js";
import type { Event } from "../schema/types/events.js";

export class LogBookMismatchError extends Error {}

/**
 * 每本书一个独立事件日志文件（DESIGN.md §14.4）——block_read/answer/checkin
 * 事件本身都不带 book_id，唯一的交叉校验点是日志里第一条 session_start 记录
 * 的 book_id。--pack/--log 传错组合（比如 --pack 换了书，--log 忘了跟着换）
 * 会让两本书的 block id（各自都从 b0001 起步）在同一份日志里打架，reducer
 * 不会报错，只会静默算出一份混乱的状态——这里在真正开始处理前就直接拒绝，
 * 而不是等着产生难以察觉的坏数据。
 */
export function assertLogMatchesPack(
  events: readonly Event[],
  expectedBookId: string,
  logPath: string,
): void {
  const loggedBookId = findLoggedBookId(events);
  if (loggedBookId !== null && loggedBookId !== expectedBookId) {
    throw new LogBookMismatchError(
      `${logPath} already belongs to book "${loggedBookId}", but the loaded pack is "${expectedBookId}". ` +
        `Use a different --log path for this pack (or double-check --pack).`,
    );
  }
}
