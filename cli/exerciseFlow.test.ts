import { describe, it, expect, vi } from "vitest";
import { runExerciseFlow } from "./exerciseFlow.js";
import type { Exercise } from "../schema/types/pack.js";

function exercise(id: string): Exercise {
  return { id, block_id: "b0001", number: "1.1", prompt_md: `prompt of ${id}`, hint_md: `hint of ${id}` };
}

describe("runExerciseFlow", () => {
  it("attempts each exercise in order and reports the outcome", async () => {
    const exercises = [exercise("x0001"), exercise("x0002")];
    const attempted: string[] = [];
    const outcomes: [string, number, boolean][] = [];

    await runExerciseFlow(exercises, {
      attempt: async (e) => {
        attempted.push(e.id);
        return { seconds: e.id === "x0001" ? 30 : 90, usedHint: e.id === "x0002" };
      },
      onAttempted: (e, outcome) => {
        outcomes.push([e.id, outcome.seconds, outcome.usedHint]);
      },
    });

    expect(attempted).toEqual(["x0001", "x0002"]);
    expect(outcomes).toEqual([
      ["x0001", 30, false],
      ["x0002", 90, true],
    ]);
  });

  it("does nothing when given an empty exercise list", async () => {
    const onAttempted = vi.fn();
    await runExerciseFlow([], { attempt: vi.fn(), onAttempted });
    expect(onAttempted).not.toHaveBeenCalled();
  });
});
