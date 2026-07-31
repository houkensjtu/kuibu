import { shuffleOptions } from "../core/questionQueue.js";
import type { QueueEntry, ShuffledOptions } from "../core/questionQueue.js";
import type { Question } from "../schema/types/pack.js";

export interface AnswerFlowDeps {
  /** 呈现一道题（已打乱选项）并返回用户选中的下标（相对 shuffled.options）。 */
  ask: (question: Question, shuffled: ShuffledOptions) => Promise<number> | number;
  /** 每道题作答完毕后回调一次，由调用方决定怎么呈现反馈、怎么落盘成 answer 事件。 */
  onAnswered: (
    entry: QueueEntry,
    question: Question,
    shuffled: ShuffledOptions,
    chosenIndex: number,
    correct: boolean,
  ) => void;
  /** 注入的 RNG，透传给 shuffleOptions；默认 Math.random。 */
  random?: () => number;
}

/**
 * 依次呈现队列里的每道题、打乱选项、收集作答、判分。
 * 选项在这里当场 shuffle（而不是建队时就 shuffle 好）——同一道错题以后再被问到时，
 * 每次呈现都是新的打乱顺序，见 core/questionQueue.ts 的注释。
 */
export async function runAnswerFlow(
  queue: readonly QueueEntry[],
  questionsById: ReadonlyMap<string, Question>,
  { ask, onAnswered, random }: AnswerFlowDeps,
): Promise<void> {
  for (const entry of queue) {
    const question = questionsById.get(entry.questionId);
    if (!question) continue; // 未知 question_id，理论上不该发生，跳过而不是崩溃

    const shuffled = shuffleOptions(question, random);
    const chosenIndex = await ask(question, shuffled);
    const correct = chosenIndex === shuffled.answerIndex;

    onAnswered(entry, question, shuffled, chosenIndex, correct);
  }
}
