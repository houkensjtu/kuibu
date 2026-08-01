#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { loadPack, PackLoadError } from "./loadPack.js";
import { appendEvent, readEvents } from "./eventLog.js";
import { reduceEvents } from "../core/reducer.js";
import { packSession } from "../core/sessionPacker.js";
import { buildQuestionQueue } from "../core/questionQueue.js";
import { leitnerScheduler } from "../core/scheduler.js";
import { checkinDate } from "../core/checkinDate.js";
import { isCheckinComplete } from "../core/checkinJudgment.js";
import { buildHeatmap } from "../core/heatmap.js";
import { computeProgress } from "../core/progress.js";
import { runReadingFlow } from "./readingFlow.js";
import { showBlockInPagerOrFallback } from "./pager.js";
import { runAnswerFlow } from "./answerFlow.js";
import { askInTerminal } from "./answerPrompt.js";
import { renderHeatmap } from "./renderHeatmap.js";

// 阶段一先用一个固定默认值；每日时长目标可调（M2.19）会把它换成可配置项。
const DEFAULT_TARGET_SECONDS = 720;

const program = new Command();

program
  .name("kuibu")
  .description("kuibu（跬步）—— 个人读书打卡工具")
  .version("0.1.0");

program
  .command("today")
  .description("开始/继续今天的阅读打卡")
  .option("--pack <dir>", "内容包目录", "schema/examples/sample-pack")
  .option("--log <path>", "事件日志文件路径", ".kuibu-events.jsonl")
  .option("--minutes <n>", "调整每日阅读时长目标（分钟），会记住到下次运行", (v) => Number.parseInt(v, 10))
  .action(async (options: { pack: string; log: string; minutes?: number }) => {
    try {
      const pack = loadPack(options.pack);
      console.log(pack.manifest.title);
      console.log(`共 ${pack.blocks.length} 个 block`);

      const questionItemMap = new Map(pack.questions.map((q) => [q.id, q.item_id]));
      const priorEvents = readEvents(options.log);
      const state = reduceEvents(priorEvents, questionItemMap);

      let targetSeconds = state.dailyTargetSeconds ?? DEFAULT_TARGET_SECONDS;
      if (options.minutes !== undefined) {
        targetSeconds = options.minutes * 60;
        appendEvent(options.log, {
          id: randomUUID(),
          ts: new Date().toISOString(),
          type: "settings_change",
          key: "daily_target_seconds",
          value: targetSeconds,
        });
      }

      appendEvent(options.log, {
        id: randomUUID(),
        ts: new Date().toISOString(),
        type: "session_start",
        book_id: pack.manifest.book_id,
        target_seconds: targetSeconds,
      });

      const todaysBlocks = packSession({
        blocks: pack.blocks,
        readBlockIds: state.readBlockIds,
        targetSeconds,
      });

      let totalReadSecondsToday = 0;

      if (todaysBlocks.length === 0) {
        console.log("这本书已经读完啦，今天只有复习题。");
      } else {
        await runReadingFlow(todaysBlocks, {
          showBlock: showBlockInPagerOrFallback,
          onBlockRead: (blockId, seconds) => {
            totalReadSecondsToday += seconds;
            appendEvent(options.log, {
              id: randomUUID(),
              ts: new Date().toISOString(),
              type: "block_read",
              block_id: blockId,
              seconds,
            });
          },
        });
      }

      const dueItemIds = leitnerScheduler.due(
        [...state.itemStates.values()],
        checkinDate(new Date()),
      );
      const queue = buildQuestionQueue({
        todayReadBlockIds: new Set(todaysBlocks.map((b) => b.id)),
        items: pack.items,
        wrongQuestionIdByItemId: state.wrongQuestionIdByItemId,
        dueItemIds,
      });
      const questionsById = new Map(pack.questions.map((q) => [q.id, q]));
      const answeredQuestionIds = new Set<string>();

      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        await runAnswerFlow(queue, questionsById, {
          ask: (question, shuffled) => askInTerminal(rl, question, shuffled),
          onAnswered: (_entry, question, shuffled, _chosenIndex, correct) => {
            answeredQuestionIds.add(question.id);

            if (correct) {
              console.log("答对了！");
            } else {
              console.log(`答错了。正确答案：${shuffled.options[shuffled.answerIndex]}`);
              console.log(question.explanation);
            }

            appendEvent(options.log, {
              id: randomUUID(),
              ts: new Date().toISOString(),
              type: "answer",
              question_id: question.id,
              correct,
            });
          },
        });
      } finally {
        rl.close();
      }

      const today = checkinDate(new Date());
      const passed = isCheckinComplete({
        totalReadSeconds: totalReadSecondsToday,
        targetSeconds,
        queue,
        answeredQuestionIds,
      });

      const checkinDates = new Set(state.checkinDates);
      if (passed) {
        appendEvent(options.log, {
          id: randomUUID(),
          ts: new Date().toISOString(),
          type: "checkin",
          date: today,
        });
        checkinDates.add(today);
        console.log(`打卡成功！今天读了 ${totalReadSecondsToday} 秒。`);
      } else {
        const remaining = Math.max(0, targetSeconds - totalReadSecondsToday);
        console.log(`还没打上卡：阅读时长还差 ${remaining} 秒。`);
      }

      const updatedReadBlockIds = new Set([
        ...state.readBlockIds,
        ...todaysBlocks.map((b) => b.id),
      ]);
      const { lastCompletedSectionPath, percentRead } = computeProgress(
        pack.blocks,
        updatedReadBlockIds,
      );
      const sectionLabel = lastCompletedSectionPath?.at(-1) ?? "（还没读完任何小节）";
      console.log(`${sectionLabel} 已读完 · 全书 ${percentRead}%`);

      console.log();
      console.log(renderHeatmap(buildHeatmap(checkinDates, today)));
    } catch (err) {
      if (err instanceof PackLoadError) {
        console.error(err.message);
      } else {
        console.error(err);
      }
      process.exitCode = 1;
    }
  });

await program.parseAsync();
