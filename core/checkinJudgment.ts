export interface CheckinJudgmentInput {
  /** 今天已经读了多少秒（一般是今天所有 block_read 事件 seconds 之和）。 */
  totalReadSeconds: number;
  /** 今天的阅读时长目标（秒）。 */
  targetSeconds: number;
  /** 今天的题目队列（来自 buildQuestionQueue）。 */
  queue: readonly { questionId: string }[];
  /** 今天已经作答过的 question_id 集合（不论答对答错，"完成"就算数）。 */
  answeredQuestionIds: ReadonlySet<string>;
}

/**
 * 打卡判定 = 阅读计时达标 AND 当日题目全部完成（DESIGN.md §3.2）。
 * "完成"只看是否作答过，不看对错——答错会立即扣到 box 0，但不影响今天能不能打卡，
 * 否则会变成变相的惩罚机制，违背 D3 的"断签只记录不惩罚"。
 */
export function isCheckinComplete({
  totalReadSeconds,
  targetSeconds,
  queue,
  answeredQuestionIds,
}: CheckinJudgmentInput): boolean {
  const readEnough = totalReadSeconds >= targetSeconds;
  const allAnswered = queue.every((entry) => answeredQuestionIds.has(entry.questionId));
  return readEnough && allAnswered;
}
