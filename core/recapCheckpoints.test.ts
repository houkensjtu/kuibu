import { describe, it, expect } from "vitest";
import { computeCheckpointBoundaries, findApplicableRecapCheckpoint } from "./recapCheckpoints.js";
import type { Block, RecapCheckpoint } from "../schema/types/pack.js";

function block(id: string, est_seconds: number): Block {
  return {
    id,
    seq: Number(id.slice(1)),
    section_path: ["1", "1.1", "1.1.1"],
    section_title: "x",
    content_md: "...",
    est_seconds,
    recap_md: "...",
  };
}

describe("computeCheckpointBoundaries", () => {
  it("splits the whole book into checkpoints matching what packSession would pack each day", () => {
    // 5 blocks of 300s each, 700s/day target -> 2 blocks, 2 blocks, 1 block.
    const blocks = [
      block("b1", 300),
      block("b2", 300),
      block("b3", 300),
      block("b4", 300),
      block("b5", 300),
    ];
    expect(computeCheckpointBoundaries(blocks, 700)).toEqual([2, 4, 5]);
  });

  it("always makes progress even if a single block exceeds the target", () => {
    const blocks = [block("b1", 5000), block("b2", 100)];
    expect(computeCheckpointBoundaries(blocks, 700)).toEqual([1, 2]);
  });

  it("returns an empty array for an empty pack", () => {
    expect(computeCheckpointBoundaries([], 700)).toEqual([]);
  });

  it("returns a single checkpoint when everything fits in one day", () => {
    const blocks = [block("b1", 100), block("b2", 100)];
    expect(computeCheckpointBoundaries(blocks, 700)).toEqual([2]);
  });
});

describe("findApplicableRecapCheckpoint", () => {
  const checkpoints: RecapCheckpoint[] = [
    { id: "r1", through_block_count: 2, recap_md: "first" },
    { id: "r2", through_block_count: 4, recap_md: "second" },
    { id: "r3", through_block_count: 7, recap_md: "third" },
  ];

  it("returns null when nothing has been read yet", () => {
    expect(findApplicableRecapCheckpoint(checkpoints, 0)).toBeNull();
  });

  it("returns null when read count is below the first checkpoint", () => {
    expect(findApplicableRecapCheckpoint(checkpoints, 1)).toBeNull();
  });

  it("returns the exact checkpoint when read count matches it exactly", () => {
    expect(findApplicableRecapCheckpoint(checkpoints, 4)?.id).toBe("r2");
  });

  it("returns the latest checkpoint not exceeding read count, even off-pace", () => {
    // 5 blocks read - doesn't land exactly on any checkpoint, but r2 (4) still applies.
    expect(findApplicableRecapCheckpoint(checkpoints, 5)?.id).toBe("r2");
    // 6 blocks read - still r2, not yet r3 (7).
    expect(findApplicableRecapCheckpoint(checkpoints, 6)?.id).toBe("r2");
  });

  it("returns the last checkpoint once read count meets or exceeds it", () => {
    expect(findApplicableRecapCheckpoint(checkpoints, 7)?.id).toBe("r3");
    expect(findApplicableRecapCheckpoint(checkpoints, 137)?.id).toBe("r3");
  });

  it("returns null for an empty checkpoint list", () => {
    expect(findApplicableRecapCheckpoint([], 50)).toBeNull();
  });
});
