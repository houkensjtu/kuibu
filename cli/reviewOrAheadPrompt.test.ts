import { describe, it, expect } from "vitest";
import { askReviewOrAhead } from "./reviewOrAheadPrompt.js";
import { UserQuit } from "./readLineOrQuit.js";
import type { LineReader } from "./lineReader.js";

function fakeLineReader(answers: readonly string[]): LineReader {
  const queue = [...answers];
  return {
    readLine: async () => queue.shift() ?? "",
    close: () => {},
  };
}

describe("askReviewOrAhead", () => {
  it("returns 'ahead' when the user types 2", async () => {
    expect(await askReviewOrAhead(fakeLineReader(["2"]))).toBe("ahead");
  });

  it("returns 'review' when the user types 1", async () => {
    expect(await askReviewOrAhead(fakeLineReader(["1"]))).toBe("review");
  });

  it("defaults to 'review' on empty input or anything other than 2", async () => {
    expect(await askReviewOrAhead(fakeLineReader([""]))).toBe("review");
    expect(await askReviewOrAhead(fakeLineReader(["banana"]))).toBe("review");
  });

  it("throws UserQuit when the user types q", async () => {
    await expect(askReviewOrAhead(fakeLineReader(["q"]))).rejects.toBeInstanceOf(UserQuit);
  });
});
