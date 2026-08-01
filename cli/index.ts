#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { loadPack, PackLoadError } from "./loadPack.js";
import { appendEvent, readEvents, writeEvents } from "./eventLog.js";
import { reduceEvents } from "../core/reducer.js";
import { packSession } from "../core/sessionPacker.js";
import { buildQuestionQueue } from "../core/questionQueue.js";
import { leitnerScheduler } from "../core/scheduler.js";
import { checkinDate } from "../core/checkinDate.js";
import { isCheckinComplete } from "../core/checkinJudgment.js";
import { buildHeatmap } from "../core/heatmap.js";
import { computeProgress } from "../core/progress.js";
import { mergeEvents } from "../core/mergeEvents.js";
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
  .description("kuibu — a personal reading checkin tool")
  .version("0.1.0");

program
  .command("today")
  .description("start/continue today's reading checkin")
  .option("--pack <dir>", "content pack directory", "schema/examples/sample-pack")
  .option("--log <path>", "event log file path", ".kuibu-events.jsonl")
  .option("--minutes <n>", "adjust daily reading target (minutes); remembered for next run", (v) => Number.parseInt(v, 10))
  .action(async (options: { pack: string; log: string; minutes?: number }) => {
    try {
      const pack = loadPack(options.pack);
      console.log(pack.manifest.title);
      console.log(`${pack.blocks.length} blocks total`);

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
        console.log("You've finished this book - just review questions today.");
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
              console.log("Correct!");
            } else {
              console.log(`Wrong. Correct answer: ${shuffled.options[shuffled.answerIndex]}`);
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
        console.log(`Checked in! Read for ${totalReadSecondsToday}s today.`);
      } else {
        const remaining = Math.max(0, targetSeconds - totalReadSecondsToday);
        console.log(`Not checked in yet: ${remaining}s more reading needed.`);
      }

      const updatedReadBlockIds = new Set([
        ...state.readBlockIds,
        ...todaysBlocks.map((b) => b.id),
      ]);
      const { lastCompletedSectionPath, percentRead } = computeProgress(
        pack.blocks,
        updatedReadBlockIds,
      );
      const sectionLabel = lastCompletedSectionPath?.at(-1) ?? "(no section finished yet)";
      console.log(`${sectionLabel} done · ${percentRead}% of the book`);

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

program
  .command("export")
  .description("export the event log to stdout (pair with shell redirection to save a file)")
  .option("--log <path>", "event log file path", ".kuibu-events.jsonl")
  .action((options: { log: string }) => {
    for (const event of readEvents(options.log)) {
      console.log(JSON.stringify(event));
    }
  });

program
  .command("import <file>")
  .description("merge a previously-exported event log into the current one (dedupe by id, sort by ts)")
  .option("--log <path>", "event log file path", ".kuibu-events.jsonl")
  .action((file: string, options: { log: string }) => {
    const incoming = readEvents(file);
    const current = readEvents(options.log);
    const merged = mergeEvents(current, incoming);
    writeEvents(options.log, merged);
    console.log(`Merged: ${current.length} existing + ${incoming.length} imported -> ${merged.length} total`);
  });

await program.parseAsync();
