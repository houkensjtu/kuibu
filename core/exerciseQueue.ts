import type { Exercise } from "../schema/types/pack.js";

/**
 * 今天读过的 block 解锁了哪些习题——习题是可选做的，不像 buildQuestionQueue
 * 那样要处理到期复习/错题优先级，纯粹是"今天读到的内容里有哪些习题可以选"。
 */
export function buildExerciseQueue(
  exercises: readonly Exercise[],
  todayReadBlockIds: ReadonlySet<string>,
): Exercise[] {
  return exercises.filter((e) => todayReadBlockIds.has(e.block_id));
}
