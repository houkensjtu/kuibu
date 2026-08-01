import type { LineReader } from "./lineReader.js";
import { readLineOrQuit } from "./readLineOrQuit.js";
import type { Question } from "../schema/types/pack.js";
import type { ShuffledOptions } from "../core/questionQueue.js";

/**
 * 打印题目 + 打乱后的选项，反复读输入直到拿到一个合法的选项数字。
 *
 * 接收一个外部传入、贯穿整个答题环节的 LineReader，而不是每道题自己
 * new 一个再关掉——而且特意不用 node:readline（见 lineReader.ts 的注释：
 * 同一个 readline.Interface 连续 question() 两次，在某些环境下第二次会
 * 误判 stdin 已结束，导致进程直接退出，用户什么都还没输入）。
 */
export async function askInTerminal(
  lineReader: LineReader,
  question: Question,
  shuffled: ShuffledOptions,
): Promise<number> {
  console.log(question.prompt);
  shuffled.options.forEach((option, i) => console.log(`  ${i + 1}. ${option}`));

  for (;;) {
    process.stdout.write("Your choice (enter a number, or 'q' to quit): ");
    const raw = (await readLineOrQuit(lineReader)).trim();
    const choice = Number.parseInt(raw, 10);
    if (Number.isInteger(choice) && choice >= 1 && choice <= shuffled.options.length) {
      return choice - 1;
    }
    console.log(`Please enter a number between 1 and ${shuffled.options.length}.`);
  }
}
