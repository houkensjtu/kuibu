import type { KnowledgeItem, Question } from "../schema/types/pack.js";

export type QueueReason = "new_content" | "wrong_answer" | "due";

export interface QueueEntry {
  itemId: string;
  questionId: string;
  reason: QueueReason;
}

export interface BuildQuestionQueueInput {
  /** 当日读过的 block id（一般来自 sessionPacker 这次打包出的 block 列表）。 */
  todayReadBlockIds: ReadonlySet<string>;
  /** 内容包里全部知识点。 */
  items: readonly KnowledgeItem[];
  /** 来自 reducer：itemId -> 最近一次答错时对应的 question_id。 */
  wrongQuestionIdByItemId: ReadonlyMap<string, string>;
  /** 来自 scheduler.due()：到期的 itemId 列表。 */
  dueItemIds: readonly string[];
  /** 新内容理解题的固定数量，DESIGN.md 规定为 2。 */
  newContentCount?: number;
  /** 队列总量上限；只截断"到期项"这一段，新内容题和错题不受影响（§5.3 错题优先）。 */
  maxTotalQuestions?: number;
}

/**
 * 建队顺序（DESIGN.md §3.4）：新内容理解题（固定 newContentCount 道）→ 错题（全部，
 * 不截断）→ 其余到期项（按 maxTotalQuestions 截断，超出的部分留到明天，不算已完成）。
 * 每个 itemId 只出现一次：新内容题优先级最高，同一个 item 不会在错题/到期项里重复出现。
 */
export function buildQuestionQueue({
  todayReadBlockIds,
  items,
  wrongQuestionIdByItemId,
  dueItemIds,
  newContentCount = 2,
  maxTotalQuestions,
}: BuildQuestionQueueInput): QueueEntry[] {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const included = new Set<string>();
  const queue: QueueEntry[] = [];

  let newContentAdded = 0;
  for (const item of items) {
    if (newContentAdded >= newContentCount) break;
    const introducedToday = item.block_ids.some((id) => todayReadBlockIds.has(id));
    if (!introducedToday) continue;

    queue.push({ itemId: item.id, questionId: item.question_ids[0], reason: "new_content" });
    included.add(item.id);
    newContentAdded++;
  }

  for (const [itemId, questionId] of wrongQuestionIdByItemId) {
    if (included.has(itemId)) continue;
    queue.push({ itemId, questionId, reason: "wrong_answer" });
    included.add(itemId);
  }

  for (const itemId of dueItemIds) {
    if (included.has(itemId)) continue;
    if (maxTotalQuestions !== undefined && queue.length >= maxTotalQuestions) break;

    const item = itemsById.get(itemId);
    if (!item) continue; // 未知 itemId，理论上不该发生，忽略而不是崩溃

    queue.push({ itemId, questionId: item.question_ids[0], reason: "due" });
    included.add(itemId);
  }

  return queue;
}

export interface ShuffledOptions {
  options: string[];
  /** 正确答案在 shuffle 之后的 options 数组里的下标。 */
  answerIndex: number;
}

/**
 * 把题目选项随机打乱（Fisher-Yates），random 默认 Math.random 但可注入以便测试/复现。
 * 存储仍然用原始 question.answer_index；这里只在"呈现"这一步做打乱，每次呈现都重新
 * 打乱一次——同一道错题被反复问到时，不会因为记住了"答案在 B 位"而蒙对。
 */
export function shuffleOptions(
  question: Question,
  random: () => number = Math.random,
): ShuffledOptions {
  const indices = question.options.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  return {
    options: indices.map((i) => question.options[i]),
    answerIndex: indices.indexOf(question.answer_index),
  };
}
