import type { Event } from "../schema/types/events.js";

/**
 * 按 id 去重、按 (ts, id) 排序合并两份事件日志（DESIGN.md §6.1）。
 * id 本身已经是每条事件的全局唯一标识，所以去重直接按 id 做；ts 只是排序键。
 * 事件日志天然可合并（不像状态快照那样有"哪边赢"的冲突），这是多端同步的基础。
 */
export function mergeEvents(a: readonly Event[], b: readonly Event[]): Event[] {
  const byId = new Map<string, Event>();
  for (const event of a) byId.set(event.id, event);
  for (const event of b) byId.set(event.id, event);

  return [...byId.values()].sort((x, y) => {
    if (x.ts !== y.ts) return x.ts < y.ts ? -1 : 1;
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  });
}
