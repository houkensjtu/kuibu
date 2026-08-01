import type { LineReader } from "./lineReader.js";
import { readLineOrQuit } from "./readLineOrQuit.js";
import type { Exercise } from "../schema/types/pack.js";
import type { ExerciseAttemptOutcome } from "./exerciseFlow.js";

/**
 * 展示原书习题原文，用户自己做（这个 app 不判分、不检查），可以反复看 hint
 * （不是答案），按 Enter 表示做完。计时锚点是"看到题目"到"按 Enter"之间，
 * 跟 block 阅读计时同一个模式（进入到退出）——哪怕中途看了 hint，时间也
 * 照算，因为看 hint 本身也是"花在这道题上的时间"的一部分。
 */
export async function attemptExercise(
  lineReader: LineReader,
  exercise: Exercise,
  now: () => number = Date.now,
): Promise<ExerciseAttemptOutcome> {
  console.log(`\nExercise ${exercise.number}`);
  console.log(exercise.prompt_md);

  const startedAt = now();
  let usedHint = false;

  for (;;) {
    process.stdout.write("Press Enter when done, or type 'hint' (or 'q' to quit): ");
    const raw = (await readLineOrQuit(lineReader)).trim().toLowerCase();
    if (raw === "hint") {
      usedHint = true;
      console.log(exercise.hint_md);
      continue;
    }
    break;
  }

  const seconds = Math.max(0, Math.round((now() - startedAt) / 1000));
  return { seconds, usedHint };
}
