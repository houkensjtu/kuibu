import { leitnerScheduler } from "./scheduler.js";
import type { ItemState } from "./scheduler.js";
import { checkinDate } from "./checkinDate.js";
import type { Event } from "../schema/types/events.js";

export interface ReducedState {
  /** 出现过 block_read 事件的 block id 集合，即"已读过"的 block。 */
  readBlockIds: Set<string>;
  /** itemId -> 该知识点当前的 Leitner box 状态。 */
  itemStates: Map<string, ItemState>;
  /** 已经打过卡的日期集合（"YYYY-MM-DD"，来自事件里预先换算好的 date 字段）。 */
  checkinDates: Set<string>;
  /** itemId -> 该知识点最近一次答错时对应的 question_id，答对后会被清除。 */
  wrongQuestionIdByItemId: Map<string, string>;
  /** 当前生效的每日阅读时长目标（秒），取 session_start / settings_change 里最新的一条。 */
  dailyTargetSeconds?: number;
}

function emptyState(): ReducedState {
  return {
    readBlockIds: new Set(),
    itemStates: new Map(),
    checkinDates: new Set(),
    wrongQuestionIdByItemId: new Map(),
  };
}

/**
 * 把事件日志折叠成当前状态。这是铁律 5（append-only 事件日志）的另一半：
 * 日志本身不是状态，状态由这个纯函数每次从头折叠得出，不单独持久化。
 *
 * answer 事件只带 question_id，而 Leitner 调度是按知识点（itemId）走的，
 * 所以需要调用方传入 question_id -> itemId 的映射（来自内容包的 questions 数组），
 * reducer 本身不认识内容包的结构。
 */
export function reduceEvents(
  events: readonly Event[],
  questionItemMap: ReadonlyMap<string, string>,
): ReducedState {
  const state = emptyState();

  for (const event of events) {
    switch (event.type) {
      case "session_start":
        state.dailyTargetSeconds = event.target_seconds;
        break;

      case "block_read":
        state.readBlockIds.add(event.block_id);
        break;

      case "answer": {
        const itemId = questionItemMap.get(event.question_id);
        if (!itemId) break; // 未知题目 id，理论上不该发生，忽略而不是崩溃

        const previous = state.itemStates.get(itemId);
        const today = checkinDate(new Date(event.ts));
        state.itemStates.set(
          itemId,
          leitnerScheduler.onAnswer(itemId, event.correct, today, previous),
        );

        if (event.correct) {
          state.wrongQuestionIdByItemId.delete(itemId);
        } else {
          state.wrongQuestionIdByItemId.set(itemId, event.question_id);
        }
        break;
      }

      case "checkin":
        state.checkinDates.add(event.date);
        break;

      case "settings_change":
        if (
          event.key === "daily_target_seconds" &&
          typeof event.value === "number"
        ) {
          state.dailyTargetSeconds = event.value;
        }
        break;
    }
  }

  return state;
}
