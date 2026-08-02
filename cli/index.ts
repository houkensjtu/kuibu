#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { loadPack, PackLoadError } from "./loadPack.js";
import { discoverPacks, resolvePackDir } from "./discoverPacks.js";
import { appendEvent, readEvents, writeEvents } from "./eventLog.js";
import { reduceEvents, blockIdsReadOnDate } from "../core/reducer.js";
import { assertLogMatchesPack, LogBookMismatchError } from "./logGuard.js";
import { packSession } from "../core/sessionPacker.js";
import { buildQuestionQueue } from "../core/questionQueue.js";
import { leitnerScheduler } from "../core/scheduler.js";
import { checkinDate } from "../core/checkinDate.js";
import { isCheckinComplete } from "../core/checkinJudgment.js";
import { computeCurrentStreak } from "../core/streak.js";
import { buildYearCalendar } from "../core/yearCalendar.js";
import { computeProgress, computeCurrentPosition } from "../core/progress.js";
import { estimateDaysRemaining, estimateMinutesRemaining } from "../core/completionEstimate.js";
import { buildTableOfContents } from "../core/tableOfContents.js";
import { renderTableOfContents } from "./renderTableOfContents.js";
import { mergeEvents } from "../core/mergeEvents.js";
import { buildExerciseQueue } from "../core/exerciseQueue.js";
import { findApplicableRecapCheckpoint } from "../core/recapCheckpoints.js";
import { runReadingFlow } from "./readingFlow.js";
import { printBlocks } from "./renderBlocks.js";
import { printSectionDivider } from "./sectionDivider.js";
import { runAnswerFlow } from "./answerFlow.js";
import { askInTerminal } from "./answerPrompt.js";
import { runExerciseFlow } from "./exerciseFlow.js";
import { attemptExercise } from "./exercisePrompt.js";
import { renderYearCalendar } from "./renderYearCalendar.js";
import { askDailyTargetMinutes, classifyTimeSpent, askAdjustTarget } from "./targetPrompt.js";
import { askReviewOrAhead } from "./reviewOrAheadPrompt.js";
import { createLineReader } from "./lineReader.js";
import { UserQuit, readLineOrQuit } from "./readLineOrQuit.js";
import { printGoodbye } from "./goodbye.js";
import packageJson from "../package.json" with { type: "json" };

const DEFAULT_TARGET_MINUTES = 12;
const DEFAULT_PACK = "packs/public/sicp";

/**
 * 每本书一个独立事件日志文件（DESIGN.md §14.4）：不传 --log 时，日志路径按
 * --pack 目录名推导——SICP（真正在用的默认 pack）继续用老路径
 * .kuibu-events.jsonl，保证老用户的默认行为不变；其他 pack 默认
 * .kuibu-events-<packname>.jsonl，不用每次都手动传两个 option。
 * 传了 --log 就永远以它为准，这里只处理"没传"的默认值推导。
 */
function defaultLogPath(packDir: string): string {
  if (packDir === DEFAULT_PACK) return ".kuibu-events.jsonl";
  const packName = packDir.split(/[\\/]/).filter(Boolean).at(-1) ?? packDir;
  return `.kuibu-events-${packName}.jsonl`;
}

const program = new Command();

program
  .name("kuibu")
  .description("kuibu — a personal reading checkin tool")
  .version(packageJson.version);

program
  .command("today")
  .description("start/continue today's reading checkin")
  .option("--pack <dir-or-book-id>", "content pack directory, or a short book id (see `kuibu books`)", DEFAULT_PACK)
  .option("--log <path>", "event log file path (default: derived from --pack)")
  .option("--minutes <n>", "adjust daily reading target (minutes); remembered for next run", (v) => Number.parseInt(v, 10))
  .action(async (options: { pack: string; log?: string; minutes?: number }) => {
    // 声明在 try 外面，好让下面 catch 块里的 UserQuit 分支也能引用到它；
    // 一开始用未解析的 options.pack 兜底（万一 resolvePackDir 本身就抛错，
    // 这个值不会被用到，但类型上必须先有个确定的 string，不能是 undefined）。
    let logPath = options.log ?? defaultLogPath(options.pack);
    try {
      const packDir = resolvePackDir(options.pack, discoverPacks());
      logPath = options.log ?? defaultLogPath(packDir);

      // Ctrl-C is one of only two accepted ways to quit (the other is typing "q" at
      // any prompt, see readLineOrQuit.ts) - both print a goodbye instead of dying
      // with a raw stack trace/no message.
      process.on("SIGINT", () => {
        printGoodbye(logPath);
        process.exit(0);
      });

      const pack = loadPack(packDir);
      console.log(pack.manifest.title);
      console.log(`${pack.blocks.length} blocks total`);

      const questionItemMap = new Map(pack.questions.map((q) => [q.id, q.item_id]));
      const priorEvents = readEvents(logPath);
      assertLogMatchesPack(priorEvents, pack.manifest.book_id, logPath);
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
              printSectionDivider("Reading (review)");
              printBlocks(reviewBlocks, pack.section_headings);
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
          appendEvent(logPath, {
            id: randomUUID(),
            ts: new Date().toISOString(),
            type: "settings_change",
            key: "daily_target_seconds",
            value: targetSeconds,
          });
        }

        appendEvent(logPath, {
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

        // 前情回顾：查表，不调用任何 LLM/API——回顾文本是构建期一次性写好的，
        // 按"用户实际累计读过多少个 block"定位，不依赖每天固定读多久这个假设
        // （那个假设只在生成回顾文本时用来决定切分粒度，见 core/recapCheckpoints.ts）。
        // 花在这段的时间计入今天的阅读时长反馈，跟习题时间同一个模式。
        if (todaysBlocks.length > 0) {
          const checkpoint = findApplicableRecapCheckpoint(
            pack.recap_checkpoints,
            state.readBlockIds.size,
          );
          if (checkpoint !== null) {
            printSectionDivider("Recap");
            const currentPosition = computeCurrentPosition(pack.blocks, state.readBlockIds);
            console.log(
              renderTableOfContents(
                buildTableOfContents(pack.blocks, pack.section_headings),
                currentPosition?.sectionPath ?? null,
              ),
            );
            console.log();
            console.log(checkpoint.recap_md);
            console.log();
            const recapStartedAt = Date.now();
            process.stdout.write("Press Enter to continue to today's reading (or 'q' to quit): ");
            await readLineOrQuit(lineReader);
            totalReadSecondsToday += Math.max(0, Math.round((Date.now() - recapStartedAt) / 1000));
          }
        }

        if (todaysBlocks.length === 0) {
          console.log("You've finished this book - just review questions today.");
        } else {
          // 今天第一个 block 所在的小节，是不是之前某天已经读过一部分（断在
          // 小节中间，而不是正好断在小节边界）——是的话正文头部要补一个 "..."
          // 提示这里之前还有内容，而不是让读者误以为从头开始，见用户反馈。
          const firstBlock = todaysBlocks[0];
          const resumingMidSection = pack.blocks.some(
            (b) =>
              b.id !== firstBlock.id &&
              b.section_path.join("/") === firstBlock.section_path.join("/") &&
              readBlockIdsForPacking.has(b.id),
          );

          printSectionDivider("Reading");
          await runReadingFlow(todaysBlocks, {
            showBlocks: (blocks) => printBlocks(blocks, pack.section_headings, { resumingMidSection }),
            waitUntilDone: async () => {
              process.stdout.write("Press Enter to continue to review questions (or 'q' to quit): ");
              await readLineOrQuit(lineReader);
            },
            onBlockRead: (blockId, seconds) => {
              totalReadSecondsToday += seconds;
              readBlockIdsToday.add(blockId);
              appendEvent(logPath, {
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

        if (queue.length > 0) {
          printSectionDivider("Review Questions");
        }
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

            appendEvent(logPath, {
              id: randomUUID(),
              ts: new Date().toISOString(),
              type: "answer",
              question_id: question.id,
              correct,
            });
          },
        });

        // 习题是可选做的，跟上面的复习题是两种不同的东西：不影响打卡判定。
        // 进入习题环节本身不问 y/N（跟阅读→复习一样，按 Enter 就往下走），
        // 但每一道题都可以直接按 Enter 跳过，不点开 hint 也不强求作答——
        // "可选"体现在题目本身可以秒过，而不是靠一个整体的"要不要做"开关。
        // 花在习题上的时间计入今天的阅读时长反馈（下面的 classifyTimeSpent），
        // 但不影响 est_seconds/block 切分——切分本来就只按文字量估算，跟做题
        // 要花多久无关，这是用户自己的事。
        const todaysExercises = buildExerciseQueue(
          pack.exercises,
          new Set(todaysBlocks.map((b) => b.id)),
        );
        if (todaysExercises.length > 0) {
          process.stdout.write(
            `There ${todaysExercises.length === 1 ? "is" : "are"} ${todaysExercises.length} optional exercise${todaysExercises.length === 1 ? "" : "s"} from today's reading.\nPress Enter to continue to exercises (or 'q' to quit): `,
          );
          await readLineOrQuit(lineReader);
          printSectionDivider("Exercises (optional)");
          await runExerciseFlow(todaysExercises, {
            attempt: (exercise) => attemptExercise(lineReader, exercise),
            onAttempted: (exercise, outcome) => {
              totalReadSecondsToday += outcome.seconds;
              appendEvent(logPath, {
                id: randomUUID(),
                ts: new Date().toISOString(),
                type: "exercise_attempt",
                exercise_id: exercise.id,
                seconds: outcome.seconds,
                used_hint: outcome.usedHint,
              });
            },
          });
        }

        const passed = isCheckinComplete({
          assignedBlockIds: todaysBlocks.map((b) => b.id),
          readBlockIdsToday,
          queue,
          answeredQuestionIds,
        });

        const checkinDates = new Set(state.checkinDates);
        if (passed) {
          appendEvent(logPath, {
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
              appendEvent(logPath, {
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
              appendEvent(logPath, {
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
        printGoodbye(logPath);
      } else if (err instanceof PackLoadError || err instanceof LogBookMismatchError) {
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
  .option("--pack <dir-or-book-id>", "content pack directory, or a short book id (see `kuibu books`)", DEFAULT_PACK)
  .option("--log <path>", "event log file path (default: derived from --pack)")
  .action((options: { pack: string; log?: string }) => {
    try {
      const packDir = resolvePackDir(options.pack, discoverPacks());
      const logPath = options.log ?? defaultLogPath(packDir);
      const pack = loadPack(packDir);
      const questionItemMap = new Map(pack.questions.map((q) => [q.id, q.item_id]));
      const priorEvents = readEvents(logPath);
      assertLogMatchesPack(priorEvents, pack.manifest.book_id, logPath);
      const state = reduceEvents(priorEvents, questionItemMap);

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

      const currentPosition = computeCurrentPosition(pack.blocks, state.readBlockIds);
      console.log();
      console.log("Table of contents:");
      console.log(
        renderTableOfContents(
          buildTableOfContents(pack.blocks, pack.section_headings),
          currentPosition?.sectionPath ?? null,
        ),
      );

      if (currentPosition === null) {
        console.log("You've read every block in this pack - nothing left!");
      } else {
        // status 是只读命令、不问用户任何问题，所以从来没设置过目标时就借用
        // today 首次运行时的同一个默认值，只是要老实说明这只是个假设，不是
        // 用户真正定过的目标。
        const targetSecondsForEstimate = state.dailyTargetSeconds ?? DEFAULT_TARGET_MINUTES * 60;
        const daysRemaining = estimateDaysRemaining(
          pack.blocks,
          state.readBlockIds,
          targetSecondsForEstimate,
        );
        const minutesRemaining = estimateMinutesRemaining(pack.blocks, state.readBlockIds);
        const assumedNote =
          state.dailyTargetSeconds === undefined
            ? ` (assuming ${DEFAULT_TARGET_MINUTES} min/day - no target set yet)`
            : "";
        console.log(
          `Estimated ${daysRemaining} more day${daysRemaining === 1 ? "" : "s"} to finish at your current pace${assumedNote}.`,
        );
        console.log(`About ${minutesRemaining} minute${minutesRemaining === 1 ? "" : "s"} of reading left in total.`);
      }

      const dueCount = leitnerScheduler.due([...state.itemStates.values()], today).length;
      console.log(`${dueCount} item${dueCount === 1 ? "" : "s"} due for review today.`);

      console.log();
      console.log(renderYearCalendar(buildYearCalendar(state.checkinDates, Number(today.slice(0, 4)))));
    } catch (err) {
      if (err instanceof PackLoadError || err instanceof LogBookMismatchError) {
        console.error(err.message);
      } else {
        console.error(err);
      }
      process.exitCode = 1;
    }
  });

program
  .command("books")
  .description("list every known book (packs/public + packs/private) with a one-line progress summary")
  .action(() => {
    const discovered = discoverPacks();
    if (discovered.length === 0) {
      console.log("No content packs found under packs/public/ or packs/private/.");
      return;
    }

    const today = checkinDate(new Date());
    // 两遍：先算出每本书要打印的字段，再统一按最长的 bookId/title 对齐——
    // 不然每行列宽不一样，多本书刷屏时很难扫视对比。
    const rows = discovered.map(({ bookId, packDir }) => {
      try {
        const pack = loadPack(packDir);
        const questionItemMap = new Map(pack.questions.map((q) => [q.id, q.item_id]));
        const state = reduceEvents(readEvents(defaultLogPath(packDir)), questionItemMap);
        const streak = computeCurrentStreak(state.checkinDates, today);
        const checkedInToday = state.checkinDates.has(today) ? "checked in today" : "not checked in today";
        const { percentRead } = computeProgress(pack.blocks, state.readBlockIds);
        return {
          bookId,
          summary: `${pack.manifest.title}  -  ${streak} day streak, ${checkedInToday}, ${percentRead}% read`,
        };
      } catch (err) {
        const message = err instanceof PackLoadError ? err.message : String(err);
        return { bookId, summary: `(failed to load: ${message})` };
      }
    });

    const idWidth = Math.max(...rows.map((r) => r.bookId.length));
    for (const { bookId, summary } of rows) {
      console.log(`${bookId.padEnd(idWidth)}  ${summary}`);
    }
    console.log();
    console.log("Use `kuibu today --pack <book id>` / `kuibu status --pack <book id>` to switch books.");
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
