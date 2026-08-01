import type { Exercise } from "../schema/types/pack.js";

export interface ExerciseAttemptOutcome {
  seconds: number;
  usedHint: boolean;
}

export interface ExerciseFlowDeps {
  /** 呈现一道习题、等用户做完/看提示/退出，返回耗时 + 是否看过 hint。 */
  attempt: (exercise: Exercise) => Promise<ExerciseAttemptOutcome>;
  /** 每道习题"做完"后回调一次，调用方负责落盘成 exercise_attempt 事件。 */
  onAttempted: (exercise: Exercise, outcome: ExerciseAttemptOutcome) => void;
}

/**
 * 依次呈现今天解锁的习题——是否要做已经在调用方那一层问过一次（整体的
 * "要不要做习题"），进到这里就是每道都走一遍，用户可以在 attempt 里通过
 * 立刻按 Enter 变相跳过某一道，不需要每道题再单独问一次"要不要做"。
 */
export async function runExerciseFlow(
  exercises: readonly Exercise[],
  { attempt, onAttempted }: ExerciseFlowDeps,
): Promise<void> {
  for (const exercise of exercises) {
    const outcome = await attempt(exercise);
    onAttempted(exercise, outcome);
  }
}
