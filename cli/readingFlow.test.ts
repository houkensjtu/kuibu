import { describe, it, expect, vi } from "vitest";
import { runReadingFlow } from "./readingFlow.js";
import type { Block } from "../schema/types/pack.js";

function block(id: string, est_seconds: number): Block {
  return {
    id,
    seq: 1,
    section_path: ["1", "1.1", "1.1.1"],
    section_title: "The Elements of Programming",
    content_md: `content of ${id}`,
    est_seconds,
    recap_md: `recap of ${id}`,
  };
}

describe("runReadingFlow", () => {
  it("shows all blocks at once, then splits the single measured duration proportionally by est_seconds", async () => {
    const blocks = [block("b0001", 100), block("b0002", 300)]; // 1:3 ratio
    let shown: readonly Block[] | null = null;
    const reads: [string, number][] = [];

    const clockValues = [1000, 1000 + 40000]; // 40s total elapsed
    let i = 0;
    const now = () => clockValues[i++];

    await runReadingFlow(blocks, {
      showBlocks: (bs) => {
        shown = bs;
      },
      waitUntilDone: async () => {},
      onBlockRead: (blockId, seconds) => {
        reads.push([blockId, seconds]);
      },
      now,
    });

    expect(shown).toEqual(blocks);
    // 100/400 * 40 = 10s, 300/400 * 40 = 30s
    expect(reads).toEqual([
      ["b0001", 10],
      ["b0002", 30],
    ]);
  });

  it("makes the last block absorb any rounding remainder so the total always matches", async () => {
    const blocks = [block("b0001", 100), block("b0002", 100), block("b0003", 100)]; // even thirds of 10s
    const reads: [string, number][] = [];
    const clockValues = [0, 10000];
    let i = 0;
    const now = () => clockValues[i++];

    await runReadingFlow(blocks, {
      showBlocks: () => {},
      waitUntilDone: async () => {},
      onBlockRead: (blockId, seconds) => reads.push([blockId, seconds]),
      now,
    });

    const total = reads.reduce((sum, [, s]) => sum + s, 0);
    expect(total).toBe(10);
  });

  it("awaits an async waitUntilDone before allocating any time", async () => {
    const blocks = [block("b0001", 100)];
    const order: string[] = [];

    await runReadingFlow(blocks, {
      showBlocks: () => order.push("shown"),
      waitUntilDone: async () => {
        order.push("waiting:start");
        await new Promise((resolve) => setTimeout(resolve, 0));
        order.push("waiting:end");
      },
      onBlockRead: () => order.push("read"),
    });

    expect(order).toEqual(["shown", "waiting:start", "waiting:end", "read"]);
  });

  it("does nothing when given an empty block list - does not even call showBlocks/waitUntilDone", async () => {
    const showBlocks = vi.fn();
    const waitUntilDone = vi.fn();
    const onBlockRead = vi.fn();

    await runReadingFlow([], { showBlocks, waitUntilDone, onBlockRead });

    expect(showBlocks).not.toHaveBeenCalled();
    expect(waitUntilDone).not.toHaveBeenCalled();
    expect(onBlockRead).not.toHaveBeenCalled();
  });
});
