import { describe, it, expect } from "vitest";
import { attemptExercise } from "./exercisePrompt.js";
import { UserQuit } from "./readLineOrQuit.js";
import type { LineReader } from "./lineReader.js";
import type { Exercise } from "../schema/types/pack.js";

function fakeLineReader(answers: readonly string[]): LineReader {
  const queue = [...answers];
  return {
    readLine: async () => queue.shift() ?? "",
    close: () => {},
  };
}

const exercise: Exercise = {
  id: "x0001",
  block_id: "b0001",
  number: "1.9",
  prompt_md: "Trace two definitions of addition using inc and dec.",
  hint_md: "Look at which one defers an operation until after the recursive call returns.",
};

describe("attemptExercise", () => {
  it("returns elapsed seconds and usedHint=false when the user just presses Enter", async () => {
    const clockValues = [1000, 1000 + 45000];
    let i = 0;
    const now = () => clockValues[i++];

    const result = await attemptExercise(fakeLineReader([""]), exercise, now);
    expect(result).toEqual({ seconds: 45, usedHint: false });
  });

  it("shows the hint and keeps waiting when the user types 'hint', then returns usedHint=true", async () => {
    const clockValues = [1000, 1000 + 60000];
    let i = 0;
    const now = () => clockValues[i++];

    const result = await attemptExercise(fakeLineReader(["hint", ""]), exercise, now);
    expect(result).toEqual({ seconds: 60, usedHint: true });
  });

  it("throws UserQuit when the user types q", async () => {
    await expect(attemptExercise(fakeLineReader(["q"]), exercise)).rejects.toBeInstanceOf(UserQuit);
  });

  it("throws UserQuit if q is typed after viewing the hint", async () => {
    await expect(attemptExercise(fakeLineReader(["hint", "q"]), exercise)).rejects.toBeInstanceOf(UserQuit);
  });
});
