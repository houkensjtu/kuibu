import { describe, it, expect } from "vitest";
import { buildExerciseQueue } from "./exerciseQueue.js";
import type { Exercise } from "../schema/types/pack.js";

function exercise(id: string, block_id: string): Exercise {
  return { id, block_id, number: "1.1", prompt_md: "...", hint_md: "..." };
}

describe("buildExerciseQueue", () => {
  it("only includes exercises whose block was read today", () => {
    const exercises = [exercise("x0001", "b0001"), exercise("x0002", "b0002")];
    const result = buildExerciseQueue(exercises, new Set(["b0001"]));
    expect(result.map((e) => e.id)).toEqual(["x0001"]);
  });

  it("is empty when no exercises match today's read blocks", () => {
    const exercises = [exercise("x0001", "b0001")];
    expect(buildExerciseQueue(exercises, new Set(["b0099"]))).toEqual([]);
  });

  it("is empty when there are no exercises at all", () => {
    expect(buildExerciseQueue([], new Set(["b0001"]))).toEqual([]);
  });
});
