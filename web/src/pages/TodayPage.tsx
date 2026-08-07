import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import schemeLanguage from "highlight.js/lib/languages/scheme";
import { reduceEvents } from "../../../core/reducer";
import type { ReducedState } from "../../../core/reducer";
import { packSession } from "../../../core/sessionPacker";
import { buildQuestionQueue, shuffleOptions } from "../../../core/questionQueue";
import type { QueueEntry, ShuffledOptions } from "../../../core/questionQueue";
import { leitnerScheduler } from "../../../core/scheduler";
import { checkinDate } from "../../../core/checkinDate";
import { isCheckinComplete } from "../../../core/checkinJudgment";
import { findApplicableRecapCheckpoint } from "../../../core/recapCheckpoints";
import { computeCurrentPosition } from "../../../core/progress";
import { buildTableOfContents } from "../../../core/tableOfContents";
import type { TocRow } from "../../../core/tableOfContents";
import type { Block, ContentPack, Question } from "../../../schema/types/pack";
import { loadPack, PackLoadError } from "@/lib/loadPack";
import { getAllEvents, addEvent } from "@/lib/eventsDb";
import { computeSectionHeaders, isResumingMidSection } from "@/lib/sectionHeaders";
import type { SectionHeaderLine } from "@/lib/sectionHeaders";
import { BOOK_ID } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { AnswerCard } from "@/components/AnswerCard";
import { cn } from "@/lib/utils";

const DEFAULT_TARGET_SECONDS = 720; // 12 minutes, same default as the CLI (DESIGN.md §1.3)
const HIGHLIGHT_LANGUAGES = { scheme: schemeLanguage };

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "finished" }
  | { kind: "reading"; pack: ContentPack; blocks: Block[]; resumingMidSection: boolean; reducedState: ReducedState }
  | {
      kind: "answering";
      pack: ContentPack;
      assignedBlockIds: string[];
      queue: QueueEntry[];
      questionsById: Map<string, Question>;
      currentIndex: number;
      shuffled: ShuffledOptions;
      selectedIndex: number | null;
      submitted: boolean;
      answeredQuestionIds: Set<string>;
    };

function SectionHeader({ line }: { line: SectionHeaderLine }) {
  const text = line.label ? `${line.label}  ${line.title}` : line.title;
  if (line.depth === 0) {
    return <h2 className="mt-10 text-2xl font-semibold text-foreground first:mt-0">{text}</h2>;
  }
  if (line.depth === 1) {
    return <h3 className="mt-8 text-lg font-semibold text-foreground">{text}</h3>;
  }
  return <h4 className="mt-6 text-base font-semibold text-foreground">{text}</h4>;
}

/** Mirrors cli/renderTableOfContents.ts as JSX: chapter/section headings plus
 * leaf subsections, indented by depth, current leaf arrow-marked. */
function RecapToc({ toc, currentSectionPath }: { toc: TocRow[]; currentSectionPath: readonly string[] | null }) {
  const currentKey = currentSectionPath?.join("/");
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      {toc.map((row) => {
        const key = row.sectionPath.join("/");
        const label = row.sectionPath.at(-1);
        const isCurrent = row.kind === "leaf" && key === currentKey;
        const depth = row.sectionPath.length - 1;
        return (
          <div
            key={key}
            className={cn(
              "flex items-baseline gap-2",
              isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
            )}
            style={{ paddingLeft: `${depth}rem` }}
          >
            <span className="w-3 shrink-0">{isCurrent ? "→" : ""}</span>
            <span>
              {label}  {row.sectionTitle}
            </span>
            {isCurrent && <span className="text-xs italic">you are here today</span>}
          </div>
        );
      })}
    </div>
  );
}

type AnsweringStatus = Extract<Status, { kind: "answering" }>;

/** Builds today's question queue and enters the first question. Returns null if there's nothing to answer (empty due/new-content queue is a legitimate pass, same as the CLI) -- caller goes straight to checkin in that case. */
function enterAnswering(
  pack: ContentPack,
  assignedBlockIds: string[],
  reducedState: ReducedState,
): AnsweringStatus | null {
  const today = checkinDate(new Date());
  const dueItemIds = leitnerScheduler.due([...reducedState.itemStates.values()], today);
  const queue = buildQuestionQueue({
    todayReadBlockIds: new Set(assignedBlockIds),
    items: pack.items,
    wrongQuestionIdByItemId: reducedState.wrongQuestionIdByItemId,
    dueItemIds,
  });
  const questionsById = new Map(pack.questions.map((q) => [q.id, q]));

  if (queue.length === 0) return null;

  const firstQuestion = questionsById.get(queue[0].questionId)!;
  return {
    kind: "answering",
    pack,
    assignedBlockIds,
    queue,
    questionsById,
    currentIndex: 0,
    shuffled: shuffleOptions(firstQuestion),
    selectedIndex: null,
    submitted: false,
    answeredQuestionIds: new Set(),
  };
}

export function TodayPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  // Timing anchor (web brief §"阅读视图"): one wall-clock total for the whole
  // page, apportioned across blocks by est_seconds share on "Done reading" --
  // not per-block timers. Refs, not state: this doesn't drive any UI while
  // running, so it shouldn't trigger re-renders on every pause/resume.
  const startedAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const [pack, events] = await Promise.all([loadPack(BOOK_ID), getAllEvents(BOOK_ID)]);
        if (cancelled) return;

        const questionItemMap = new Map<string, string>();
        for (const item of pack.items) {
          for (const questionId of item.question_ids) questionItemMap.set(questionId, item.id);
        }

        const reducedState = reduceEvents(events, questionItemMap);
        const targetSeconds = reducedState.dailyTargetSeconds ?? DEFAULT_TARGET_SECONDS;
        const todaysBlocks = packSession({
          blocks: pack.blocks,
          readBlockIds: reducedState.readBlockIds,
          targetSeconds,
        });

        if (todaysBlocks.length === 0) {
          setStatus({ kind: "finished" });
          return;
        }

        const resumingMidSection = isResumingMidSection(pack.blocks, todaysBlocks[0], reducedState.readBlockIds);
        setStatus({ kind: "reading", pack, blocks: todaysBlocks, resumingMidSection, reducedState });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof PackLoadError ? err.message : "Failed to load today's reading.";
        setStatus({ kind: "error", message });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Timer only runs while status is "reading" -- starts counting once
  // today's blocks are on screen, pauses whenever the tab isn't visible
  // (web brief pitfall #2: a backgrounded tab must not count as reading
  // time, or the est_seconds apportionment silently inflates every block).
  useEffect(() => {
    if (status.kind !== "reading") return;

    startedAtRef.current = Date.now();
    accumulatedMsRef.current = 0;

    function handleVisibilityChange() {
      if (document.hidden) {
        if (startedAtRef.current !== null) {
          accumulatedMsRef.current += Date.now() - startedAtRef.current;
          startedAtRef.current = null;
        }
      } else {
        startedAtRef.current = Date.now();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [status.kind]);

  const highlightPlugin = useMemo(
    (): [typeof rehypeHighlight, object] => [rehypeHighlight, { languages: HIGHLIGHT_LANGUAGES, detect: false }],
    [],
  );

  async function finishCheckin(pack: ContentPack, assignedBlockIds: string[], answeredQuestionIds: Set<string>, queue: QueueEntry[]) {
    const passed = isCheckinComplete({
      assignedBlockIds,
      readBlockIdsToday: new Set(assignedBlockIds), // this session marks every assigned block read atomically, see handleDoneReading
      queue,
      answeredQuestionIds,
    });

    if (passed) {
      await addEvent(pack.manifest.book_id, {
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        type: "checkin",
        date: checkinDate(new Date()),
      });
    }

    navigate("/", { state: { justCheckedIn: passed } });
  }

  async function handleDoneReading() {
    if (status.kind !== "reading") return;
    const { pack, blocks, reducedState } = status;

    if (startedAtRef.current !== null) {
      accumulatedMsRef.current += Date.now() - startedAtRef.current;
      startedAtRef.current = null;
    }
    const totalSeconds = Math.round(accumulatedMsRef.current / 1000);

    const totalEstSeconds = blocks.reduce((sum, b) => sum + b.est_seconds, 0);
    const now = new Date().toISOString();

    await Promise.all(
      blocks.map((block) => {
        const share = totalEstSeconds > 0 ? block.est_seconds / totalEstSeconds : 1 / blocks.length;
        const seconds = Math.round(totalSeconds * share);
        return addEvent(pack.manifest.book_id, {
          // Deterministic id: re-clicking (or a StrictMode double-invoke of
          // some future effect) overwrites the same record instead of
          // double-logging reading time for this block (pitfall #3).
          id: `block_read:${pack.manifest.book_id}:${block.id}`,
          ts: now,
          type: "block_read",
          block_id: block.id,
          seconds,
        });
      }),
    );

    const assignedBlockIds = blocks.map((b) => b.id);
    const next = enterAnswering(pack, assignedBlockIds, reducedState);
    if (next === null) {
      // Nothing due/new to answer today -- an empty queue is a legitimate pass (DESIGN.md §3.3's "若只有到期复习题, 到期数为0" case).
      await finishCheckin(pack, assignedBlockIds, new Set(), []);
      return;
    }
    setStatus(next);
  }

  function handleSelect(index: number) {
    if (status.kind !== "answering" || status.submitted) return;
    setStatus({ ...status, selectedIndex: index });
  }

  async function handleConfirm() {
    if (status.kind !== "answering" || status.selectedIndex === null) return;
    const question = status.questionsById.get(status.queue[status.currentIndex].questionId)!;
    const correct = status.selectedIndex === status.shuffled.answerIndex;

    await addEvent(status.pack.manifest.book_id, {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      type: "answer",
      question_id: question.id,
      correct,
    });

    setStatus({
      ...status,
      submitted: true,
      answeredQuestionIds: new Set(status.answeredQuestionIds).add(question.id),
    });
  }

  async function handleNext() {
    if (status.kind !== "answering") return;
    const isLast = status.currentIndex === status.queue.length - 1;

    if (isLast) {
      await finishCheckin(status.pack, status.assignedBlockIds, status.answeredQuestionIds, status.queue);
      return;
    }

    const nextIndex = status.currentIndex + 1;
    const nextQuestion = status.questionsById.get(status.queue[nextIndex].questionId)!;
    setStatus({
      ...status,
      currentIndex: nextIndex,
      shuffled: shuffleOptions(nextQuestion),
      selectedIndex: null,
      submitted: false,
    });
  }

  if (status.kind === "loading") {
    return <p className="text-sm text-muted-foreground">Loading today's reading…</p>;
  }

  if (status.kind === "error") {
    return <p className="text-sm text-destructive">{status.message}</p>;
  }

  if (status.kind === "finished") {
    return <p className="text-sm text-muted-foreground">You've finished this book — just review questions today.</p>;
  }

  if (status.kind === "answering") {
    const question = status.questionsById.get(status.queue[status.currentIndex].questionId)!;
    return (
      <AnswerCard
        question={question}
        shuffled={status.shuffled}
        questionNumber={status.currentIndex + 1}
        totalQuestions={status.queue.length}
        selectedIndex={status.selectedIndex}
        submitted={status.submitted}
        onSelect={handleSelect}
        onConfirm={handleConfirm}
        onNext={handleNext}
        isLast={status.currentIndex === status.queue.length - 1}
      />
    );
  }

  const { pack, blocks, resumingMidSection, reducedState } = status;
  let previousPath: readonly string[] = [];

  // 前情回顾（DESIGN.md §3.1.1）：查表，不调用任何 LLM/API，按用户开始今天
  // 这个 session 前累计读过的 block 数定位——跟 CLI 用同一份 core/recapCheckpoints
  // 逻辑，之前 W2 只搬了正文渲染，漏了这一段。
  const recapCheckpoint = findApplicableRecapCheckpoint(pack.recap_checkpoints, reducedState.readBlockIds.size);
  const recapCurrentPosition = recapCheckpoint
    ? computeCurrentPosition(pack.blocks, reducedState.readBlockIds)
    : null;

  return (
    <div className="flex flex-col gap-4">
      {recapCheckpoint && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold text-foreground">Recap</h2>
          <RecapToc
            toc={buildTableOfContents(pack.blocks, pack.section_headings)}
            currentSectionPath={recapCurrentPosition?.sectionPath ?? null}
          />
          <div className="prose prose-stone dark:prose-invert max-w-none text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{recapCheckpoint.recap_md}</ReactMarkdown>
          </div>
        </div>
      )}

      {blocks.map((block, index) => {
        const headers = computeSectionHeaders(previousPath, block, pack.section_headings);
        const showResumeHint = index === 0 && resumingMidSection && headers.length > 0;
        previousPath = block.section_path;

        return (
          <div key={block.id}>
            {headers.map((line) => (
              <SectionHeader key={line.depth} line={line} />
            ))}
            {showResumeHint && <p className="text-sm italic text-muted-foreground">…</p>}
            <div className="prose prose-stone dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[highlightPlugin]}>
                {block.content_md}
              </ReactMarkdown>
            </div>
          </div>
        );
      })}

      <Button size="lg" className="mt-4 w-full" onClick={handleDoneReading}>
        Done reading
      </Button>
    </div>
  );
}
