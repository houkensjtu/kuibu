import { describe, it, expect, vi } from "vitest";
import { runReadingFlow } from "./readingFlow.js";
import type { Block } from "../schema/types/pack.js";

function block(id: string): Block {
  return {
    id,
    seq: 1,
    section_path: ["1", "1.1", "1.1.1"],
    section_title: "The Elements of Programming",
    content_md: `content of ${id}`,
    est_seconds: 150,
    recap_md: `recap of ${id}`,
  };
}

describe("runReadingFlow", () => {
  it("shows each block in order and reports elapsed seconds per block", async () => {
    const blocks = [block("b0001"), block("b0002")];
    const shown: string[] = [];
    const reads: [string, number][] = [];

    // 每个 block 的 showBlock 分别耗时 5s、12s（用递增的假时钟模拟）。
    const clockValues = [1000, 1000 + 5000, 1000 + 5000, 1000 + 5000 + 12000];
    let clockIndex = 0;
    const now = () => clockValues[clockIndex++];

    await runReadingFlow(blocks, {
      showBlock: async (b) => {
        shown.push(b.id);
      },
      onBlockRead: (blockId, seconds) => {
        reads.push([blockId, seconds]);
      },
      now,
    });

    expect(shown).toEqual(["b0001", "b0002"]);
    expect(reads).toEqual([
      ["b0001", 5],
      ["b0002", 12],
    ]);
  });

  it("awaits an async showBlock before moving to the next block", async () => {
    const blocks = [block("b0001"), block("b0002")];
    const order: string[] = [];

    await runReadingFlow(blocks, {
      showBlock: async (b) => {
        order.push(`start:${b.id}`);
        await new Promise((resolve) => setTimeout(resolve, 0));
        order.push(`end:${b.id}`);
      },
      onBlockRead: (blockId) => {
        order.push(`read:${blockId}`);
      },
    });

    expect(order).toEqual([
      "start:b0001",
      "end:b0001",
      "read:b0001",
      "start:b0002",
      "end:b0002",
      "read:b0002",
    ]);
  });

  it("does nothing when given an empty block list", async () => {
    const onBlockRead = vi.fn();
    await runReadingFlow([], { showBlock: vi.fn(), onBlockRead });
    expect(onBlockRead).not.toHaveBeenCalled();
  });
});
