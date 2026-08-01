import { describe, it, expect } from "vitest";
import { readLineOrQuit, UserQuit } from "./readLineOrQuit.js";
import type { LineReader } from "./lineReader.js";

function fakeLineReader(answers: readonly string[]): LineReader {
  const queue = [...answers];
  return {
    readLine: async () => queue.shift() ?? "",
    close: () => {},
  };
}

describe("readLineOrQuit", () => {
  it("returns the raw line unchanged when it isn't 'q'", async () => {
    expect(await readLineOrQuit(fakeLineReader(["hello"]))).toBe("hello");
    expect(await readLineOrQuit(fakeLineReader([""]))).toBe("");
  });

  it("throws UserQuit when the trimmed, lowercased input is 'q'", async () => {
    await expect(readLineOrQuit(fakeLineReader(["q"]))).rejects.toBeInstanceOf(UserQuit);
    await expect(readLineOrQuit(fakeLineReader(["Q"]))).rejects.toBeInstanceOf(UserQuit);
    await expect(readLineOrQuit(fakeLineReader(["  q  "]))).rejects.toBeInstanceOf(UserQuit);
  });

  it("does not treat a word merely containing 'q' as a quit request", async () => {
    expect(await readLineOrQuit(fakeLineReader(["quit"]))).toBe("quit");
  });
});
