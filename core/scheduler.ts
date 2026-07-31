export type Box = 0 | 1 | 2 | 3 | 4;

/**
 * 每档的复习间隔（天），对应 DESIGN.md §5.2 的 box 表。
 * Box 2（7 天）是"当日读过但未被抽中出题"的起步位，其余档位靠 onAnswer 逐级升降。
 */
export const BOX_INTERVAL_DAYS: Readonly<Record<Box, number>> = {
  0: 1,
  1: 3,
  2: 7,
  3: 15,
  4: 30,
};

export interface ItemState {
  itemId: string;
  box: Box;
  /** 打卡日格式 YYYY-MM-DD，到这一天（含）才算到期。 */
  dueDate: string;
}

export interface Scheduler {
  /** 从 states 里挑出在 today（含）已到期的 itemId。 */
  due(states: ItemState[], today: string): string[];
  /**
   * 一次答题结果 -> 新的 ItemState。
   * previous 缺省代表这是该知识点第一次被回答（还没有历史 box）。
   */
  onAnswer(
    itemId: string,
    correct: boolean,
    today: string,
    previous?: ItemState,
  ): ItemState;
}

function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function dueDateForBox(box: Box, fromDate: string): string {
  return addDays(fromDate, BOX_INTERVAL_DAYS[box]);
}

export const leitnerScheduler: Scheduler = {
  due(states, today) {
    return states.filter((s) => s.dueDate <= today).map((s) => s.itemId);
  },

  onAnswer(itemId, correct, today, previous) {
    // 答错一律回到 box 0；答对则在当前 box 上升一档，封顶 box 4。
    // "首次答对"也落在这条规则里：没有 previous 时按 box 0 起算，
    // 0 + 1 = 1，符合设计表里"答对（首次）-> box 1"。
    const previousBox = previous?.box ?? 0;
    const nextBox = (correct ? Math.min(previousBox + 1, 4) : 0) as Box;

    return {
      itemId,
      box: nextBox,
      dueDate: dueDateForBox(nextBox, today),
    };
  },
};
