#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { loadPack, PackLoadError } from "./loadPack.js";
import { appendEvent, readEvents, writeEvents } from "./eventLog.js";
import { reduceEvents, blockIdsReadOnDate } from "../core/reducer.js";
import { packSession } from "../core/sessionPacker.js";
import { buildQuestionQueue } from "../core/questionQueue.js";
import { leitnerScheduler } from "../core/scheduler.js";
import { checkinDate } from "../core/checkinDate.js";
import { isCheckinComplete } from "../core/checkinJudgment.js";
import { computeCurrentStreak } from "../core/streak.js";
import { buildYearCalendar } from "../core/yearCalendar.js";
import { computeProgress } from "../core/progress.js";
import { mergeEvents } from "../core/mergeEvents.js";
import { runReadingFlow } from "./readingFlow.js";
import { showBlockInPagerOrFallback } from "./pager.js";
import { runAnswerFlow } from "./answerFlow.js";
import { askInTerminal } from "./answerPrompt.js";
import { renderYearCalendar } from "./renderYearCalendar.js";
import { askDailyTargetMinutes, classifyTimeSpent, askAdjustTarget } from "./targetPrompt.js";
import { askReviewOrAhead } from "./reviewOrAheadPrompt.js";
import { createLineReader } from "./lineReader.js";
import { UserQuit } from "./readLineOrQuit.js";
import { printGoodbye } from "./goodbye.js";

const DEFAULT_TARGET_MINUTES = 12;

const program = new Command();

program
  .name("kuibu")
  .description("kuibu — a personal reading checkin tool")
  .version("0.1.0");

program
  .command("today")
  .description("start/continue today's reading checkin")
  .option("--pack <dir>", "content pack directory", "packs/public/sicp")
  .option("--log <path>", "event log file path", ".kuibu-events.jsonl")
  .option("--minutes <n>", "adjust daily reading target (minutes); remembered for next run", (v) => Number.parseInt(v, 10))
  .action(async (options: { pack: string; log: string; minutes?: number }) => {
    // Ctrl-C is one of only two accepted ways to quit (the other is typing "q" at
    // any prompt, see readLineOrQuit.ts) - both print a goodbye instead of dying
    // with a raw stack trace/no message.
    process.on("SIGINT", () => {
      printGoodbye(options.log);
      process.exit(0);
    });

    try {
      const pack = loadPack(options.pack);
      console.log(pack.manifest.title);
      console.log(`${pack.blocks.length} blocks total`);

      const questionItemMap = new Map(pack.questions.map((q) => [q.id, q.item_id]));
      const priorEvents = readEvents(options.log);
      const state = reduceEvents(priorEvents, questionItemMap);
      const today = checkinDate(new Date());
      const checkedInToday = state.checkinDates.has(today);

      const lineReader = createLineReader();
      try {
        if (checkedInToday) {
          const choice = await askReviewOrAhead(lineReader);
          if (choice === "review") {
            const readTodayIds = blockIdsReadOnDate(priorEvents, today);
            const reviewBlocks = pack.blocks.filter((b) => readTodayIds.has(b.id));
            if (reviewBlocks.length === 0) {
              console.log("No reading recorded for today yet - nothing to review.");
            } else {
              for (const block of reviewBlocks) {
                await showBlockInPagerOrFallback(block, lineReader);
              }
              console.log("Review complete.");
            }
            return;
          }
          // choice === "ahead": fall through to the normal flow below, which
          // packs whatever comes after everything read so far - today's
          // already-read blocks are excluded automatically since readBlockIds
          // is cumulative, so this naturally becomes tomorrow's content.
        }

        let targetSeconds: number;
        let persistTargetChange = false;

        if (options.minutes !== undefined) {
          targetSeconds = options.minutes * 60;
          persistTargetChange = true;
        } else if (state.dailyTargetSeconds !== undefined) {
          targetSeconds = state.dailyTargetSeconds;
        } else {
          // First run ever (no --minutes, nothing recorded before): ask instead
          // of silently picking a number the user never agreed to.
          const minutes = await askDailyTargetMinutes(lineReader, DEFAULT_TARGET_MINUTES);
          targetSeconds = minutes * 60;
          persistTargetChange = true;
        }

        if (persistTargetChange) {
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

        // If today isn't checked in yet, don't let any of today's own already-recorded
        // block_read events (from a session that was quit/interrupted before checkin)
        // shrink what gets packed - today's reading restarts from the same original
        // list rather than resuming mid-way. Once checked in, read-ahead should of
        // course keep advancing normally, so the exclusion only applies pre-checkin.
        const readBlockIdsForPacking = checkedInToday
          ? state.readBlockIds
          : new Set(
              [...state.readBlockIds].filter(
                (id) => !blockIdsReadOnDate(priorEvents, today).has(id),
              ),
            );

        const todaysBlocks = packSession({
          blocks: pack.blocks,
          readBlockIds: readBlockIdsForPacking,
          targetSeconds,
        });

        let totalReadSecondsToday = 0;
        const readBlockIdsToday = new Set<string>();

        if (todaysBlocks.length === 0) {
          console.log("You've finished this book - just review questions today.");
        } else {
          await runReadingFlow(todaysBlocks, {
            showBlock: (block) => showBlockInPagerOrFallback(block, lineReader),
            onBlockRead: (blockId, seconds) => {
              totalReadSecondsToday += seconds;
              readBlockIdsToday.add(blockId);
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

        const dueItemIds = leitnerScheduler.due([...state.itemStates.values()], today);
        const queue = buildQuestionQueue({
          todayReadBlockIds: new Set(todaysBlocks.map((b) => b.id)),
          items: pack.items,
          wrongQuestionIdByItemId: state.wrongQuestionIdByItemId,
          dueItemIds,
        });
        const questionsById = new Map(pack.questions.map((q) => [q.id, q]));
        const answeredQuestionIds = new Set<string>();

        await runAnswerFlow(queue, questionsById, {
          ask: (question, shuffled) => askInTerminal(lineReader, question, shuffled),
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

        const passed = isCheckinComplete({
          assignedBlockIds: todaysBlocks.map((b) => b.id),
          readBlockIdsToday,
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
          console.log("Checked in!");
        } else {
          console.log("Not checked in yet - today's reading or questions aren't finished.");
        }

        // 时长不再是打卡门槛，只作为事后反馈：明显偏离目标就顺手问一句要不要调整，
        // 不偏离就只是告知一下，不用户每天都被追问。没有分配到阅读内容的日子
        // （比如书读完了、只做复习题）时长反馈没有意义，跳过。
        if (todaysBlocks.length > 0) {
          const targetMinutes = Math.round(targetSeconds / 60);
          const minutesToday = Math.round(totalReadSecondsToday / 60);
          const classification = classifyTimeSpent(totalReadSecondsToday, targetSeconds);

          if (classification === "under") {
            console.log(
              `You read for about ${minutesToday} min today, well under your ${targetMinutes}-min target - nice work getting through it anyway!`,
            );
            const newMinutes = await askAdjustTarget(lineReader, "increase", targetMinutes);
            if (newMinutes !== null) {
              appendEvent(options.log, {
                id: randomUUID(),
                ts: new Date().toISOString(),
                type: "settings_change",
                key: "daily_target_seconds",
                value: newMinutes * 60,
              });
              console.log(`Updated tomorrow's target to ${newMinutes} min.`);
            }
          } else if (classification === "over") {
            console.log(
              `You read for about ${minutesToday} min today, well over your ${targetMinutes}-min target - great focus!`,
            );
            const newMinutes = await askAdjustTarget(lineReader, "decrease", targetMinutes);
            if (newMinutes !== null) {
              appendEvent(options.log, {
                id: randomUUID(),
                ts: new Date().toISOString(),
                type: "settings_change",
                key: "daily_target_seconds",
                value: newMinutes * 60,
              });
              console.log(`Updated tomorrow's target to ${newMinutes} min.`);
            }
          } else {
            console.log(`You read for about ${minutesToday} min today (target: ${targetMinutes} min).`);
          }
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
        console.log(renderYearCalendar(buildYearCalendar(checkinDates, Number(today.slice(0, 4)))));
      } finally {
        lineReader.close();
      }
    } catch (err) {
      if (err instanceof UserQuit) {
        printGoodbye(options.log);
      } else if (err instanceof PackLoadError) {
        console.error(err.message);
        process.exitCode = 1;
      } else {
        console.error(err);
        process.exitCode = 1;
      }
    }
  });

program
  .command("status")
  .description("show current streak, today's checkin state, and reading progress without starting a session")
  .option("--pack <dir>", "content pack directory", "packs/public/sicp")
  .option("--log <path>", "event log file path", ".kuibu-events.jsonl")
  .action((options: { pack: string; log: string }) => {
    try {
      const pack = loadPack(options.pack);
      const questionItemMap = new Map(pack.questions.map((q) => [q.id, q.item_id]));
      const state = reduceEvents(readEvents(options.log), questionItemMap);

      const today = checkinDate(new Date());
      const streak = computeCurrentStreak(state.checkinDates, today);
      const checkedInToday = state.checkinDates.has(today);

      console.log(pack.manifest.title);
      console.log(checkedInToday ? `Checked in today (${today}).` : `Not checked in today (${today}) yet.`);
      console.log(`Current streak: ${streak} day${streak === 1 ? "" : "s"}.`);

      const { lastCompletedSectionPath, percentRead } = computeProgress(
        pack.blocks,
        state.readBlockIds,
      );
      const sectionLabel = lastCompletedSectionPath?.at(-1) ?? "(no section finished yet)";
      console.log(`${sectionLabel} done · ${percentRead}% of the book`);

      const dueCount = leitnerScheduler.due([...state.itemStates.values()], today).length;
      console.log(`${dueCount} item${dueCount === 1 ? "" : "s"} due for review today.`);

      console.log();
      console.log(renderYearCalendar(buildYearCalendar(state.checkinDates, Number(today.slice(0, 4)))));
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
