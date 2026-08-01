import { readEvents } from "./eventLog.js";
import { reduceEvents } from "../core/reducer.js";
import { checkinDate } from "../core/checkinDate.js";

/**
 * "q"/Ctrl-C 是仅有的两种主动退出方式，退出时都要打一句告别语——
 * 如果今天还没打卡，明确提醒用户下次重开会从头开始今天的阅读任务
 * （不是从中断的地方续上；见 cli/index.ts 里 readBlockIdsForPacking 的说明）。
 */
export function printGoodbye(logPath: string): void {
  const events = readEvents(logPath);
  const state = reduceEvents(events, new Map());
  const today = checkinDate(new Date());

  console.log();
  if (state.checkinDates.has(today)) {
    console.log("Goodbye! See you next time.");
  } else {
    console.log(
      "Goodbye! Today's checkin isn't done yet, so today's reading will start over from the beginning next time you open kuibu.",
    );
  }
}
