import type { Interface } from "node:readline/promises";
import type { Question } from "../schema/types/pack.js";
import type { ShuffledOptions } from "../core/questionQueue.js";

/**
 * 打印题目 + 打乱后的选项，反复读输入直到拿到一个合法的选项数字。
 *
 * 接收一个外部传入、贯穿整个答题环节的 readline 实例，而不是每道题自己
 * new 一个再关掉——对着同一个（尤其是非 TTY、被 pipe 过的）stdin 反复
 * 开关 readline.Interface 会丢数据，第二道题往后会读不到输入而卡住。
 */
export async function askInTerminal(
  rl: Interface,
  question: Question,
  shuffled: ShuffledOptions,
): Promise<number> {
  console.log(question.prompt);
  shuffled.options.forEach((option, i) => console.log(`  ${i + 1}. ${option}`));

  for (;;) {
    const raw = (await rl.question("你的选择（输入数字）：")).trim();
    const choice = Number.parseInt(raw, 10);
    if (Number.isInteger(choice) && choice >= 1 && choice <= shuffled.options.length) {
      return choice - 1;
    }
    console.log(`请输入 1 到 ${shuffled.options.length} 之间的数字。`);
  }
}
