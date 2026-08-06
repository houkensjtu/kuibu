import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import schemeLanguage from "highlight.js/lib/languages/scheme";
import { reduceEvents } from "../../../core/reducer";
import { packSession } from "../../../core/sessionPacker";
import type { Block, ContentPack } from "../../../schema/types/pack";
import { loadPack, PackLoadError } from "@/lib/loadPack";
import { getAllEvents, addEvent } from "@/lib/eventsDb";
import { computeSectionHeaders, isResumingMidSection } from "@/lib/sectionHeaders";
import type { SectionHeaderLine } from "@/lib/sectionHeaders";
import { BOOK_ID } from "@/lib/config";
import { Button } from "@/components/ui/button";

const DEFAULT_TARGET_SECONDS = 720; // 12 minutes, same default as the CLI (DESIGN.md §1.3)
const HIGHLIGHT_LANGUAGES = { scheme: schemeLanguage };

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "finished" }
  | { kind: "ready"; pack: ContentPack; blocks: Block[]; resumingMidSection: boolean }
  | { kind: "done"; blockCount: number; totalSeconds: number };

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

export function TodayPage() {
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

        const state = reduceEvents(events, questionItemMap);
        const targetSeconds = state.dailyTargetSeconds ?? DEFAULT_TARGET_SECONDS;
        const todaysBlocks = packSession({
          blocks: pack.blocks,
          readBlockIds: state.readBlockIds,
          targetSeconds,
        });

        if (todaysBlocks.length === 0) {
          setStatus({ kind: "finished" });
          return;
        }

        const resumingMidSection = isResumingMidSection(pack.blocks, todaysBlocks[0], state.readBlockIds);
        setStatus({ kind: "ready", pack, blocks: todaysBlocks, resumingMidSection });
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

  // Timer only runs while status is "ready" -- starts counting once today's
  // blocks are on screen, pauses whenever the tab isn't visible (web brief
  // pitfall #2: a backgrounded tab must not count as reading time, or the
  // est_seconds apportionment silently inflates every block).
  useEffect(() => {
    if (status.kind !== "ready") return;

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

  async function handleDoneReading() {
    if (status.kind !== "ready") return;
    const { pack, blocks } = status;

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

    setStatus({ kind: "done", blockCount: blocks.length, totalSeconds });
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

  if (status.kind === "done") {
    const minutes = Math.floor(status.totalSeconds / 60);
    const seconds = status.totalSeconds % 60;
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-foreground">Nice work</h1>
        <p className="text-sm text-muted-foreground">
          Logged {minutes}m {seconds}s across {status.blockCount} block{status.blockCount === 1 ? "" : "s"}.
        </p>
        <p className="text-sm text-muted-foreground">Review questions and check-in land in W3.</p>
      </div>
    );
  }

  const { pack, blocks, resumingMidSection } = status;
  let previousPath: readonly string[] = [];

  return (
    <div className="flex flex-col gap-4">
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
