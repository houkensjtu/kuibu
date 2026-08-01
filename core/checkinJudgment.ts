export interface CheckinJudgmentInput {
  /** 今天分配到的 block id（来自 sessionPacker 这次打包出的列表）。 */
  assignedBlockIds: readonly string[];
  /** 今天实际读过的 block id 集合。 */
  readBlockIdsToday: ReadonlySet<string>;
  /** 今天的题目队列（来自 buildQuestionQueue）。 */
  queue: readonly { questionId: string }[];
  /** 今天已经作答过的 question_id 集合（不论答对答错，"完成"就算数）。 */
  answeredQuestionIds: ReadonlySet<string>;
}

/**
 * 打卡判定 = 分配的阅读内容全部读完 AND 当日题目全部完成（DESIGN.md §3.2，
 * 2026-08 修订：不再要求达到时长目标——时长只作为事后反馈，见 cli/index.ts
 * 里"读少了/读多了"的鼓励 + 询问是否调整明天目标，不再是打卡的门槛）。
 * "完成"只看是否作答过，不看对错——答错会立即扣到 box 0，但不影响今天能不能打卡，
 * 否则会变成变相的惩罚机制，违背 D3 的"断签只记录不惩罚"。
 */
export function isCheckinComplete({
  assignedBlockIds,
  readBlockIdsToday,
  queue,
  answeredQuestionIds,
}: CheckinJudgmentInput): boolean {
  const allBlocksRead = assignedBlockIds.every((id) => readBlockIdsToday.has(id));
  const allAnswered = queue.every((entry) => answeredQuestionIds.has(entry.questionId));
  return allBlocksRead && allAnswered;
}
