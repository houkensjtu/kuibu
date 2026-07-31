import { describe, it, expect } from "vitest";
import { packSession } from "./sessionPacker.js";
import type { Block } from "../schema/types/pack.js";

function block(id: string, seq: number, est_seconds: number): Block {
  return {
    id,
    seq,
    section_path: ["1", "1.1", "1.1.1"],
    section_title: "The Elements of Programming",
    content_md: `content of ${id}`,
    est_seconds,
    recap_md: `recap of ${id}`,
  };
}

describe("packSession", () => {
  const blocks: Block[] = [
    block("b0001", 1, 150),
    block("b0002", 2, 140),
    block("b0003", 3, 130),
    block("b0004", 4, 200),
  ];

  it("packs as many remaining blocks as fit the time budget", () => {
    const selected = packSession({ blocks, readBlockIds: new Set(), targetSeconds: 300 });
    expect(selected.map((b) => b.id)).toEqual(["b0001", "b0002"]);
  });

  it("skips blocks that have already been read", () => {
    const selected = packSession({
      blocks,
      readBlockIds: new Set(["b0001"]),
      targetSeconds: 300,
    });
    expect(selected.map((b) => b.id)).toEqual(["b0002", "b0003"]);
  });

  it("always includes at least one remaining block, even over budget", () => {
    const selected = packSession({ blocks, readBlockIds: new Set(), targetSeconds: 10 });
    expect(selected.map((b) => b.id)).toEqual(["b0001"]);
  });

  it("returns an empty list once every block has been read", () => {
    const allRead = new Set(blocks.map((b) => b.id));
    const selected = packSession({ blocks, readBlockIds: allRead, targetSeconds: 600 });
    expect(selected).toEqual([]);
  });

  it("packs the exact remainder when it fits precisely", () => {
    const selected = packSession({ blocks, readBlockIds: new Set(), targetSeconds: 420 });
    expect(selected.map((b) => b.id)).toEqual(["b0001", "b0002", "b0003"]);
  });
});
