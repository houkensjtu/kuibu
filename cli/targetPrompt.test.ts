import { describe, it, expect } from "vitest";
import { parseMinutesInput, classifyTimeSpent } from "./targetPrompt.js";

describe("parseMinutesInput", () => {
  it("returns the default when input is empty", () => {
    expect(parseMinutesInput("", 12)).toBe(12);
    expect(parseMinutesInput("   ", 12)).toBe(12);
  });

  it("parses a valid positive integer", () => {
    expect(parseMinutesInput("8", 12)).toBe(8);
    expect(parseMinutesInput(" 20 ", 12)).toBe(20);
  });

  it("falls back to the default for zero, negative, or non-numeric input", () => {
    expect(parseMinutesInput("0", 12)).toBe(12);
    expect(parseMinutesInput("-5", 12)).toBe(12);
    expect(parseMinutesInput("banana", 12)).toBe(12);
  });

  it("truncates a decimal input to its integer part", () => {
    expect(parseMinutesInput("8.7", 12)).toBe(8);
  });
});

describe("classifyTimeSpent", () => {
  it("classifies well under target as 'under'", () => {
    expect(classifyTimeSpent(300, 720)).toBe("under");
  });

  it("classifies well over target as 'over'", () => {
    expect(classifyTimeSpent(1000, 720)).toBe("over");
  });

  it("classifies close to target as 'on-track'", () => {
    expect(classifyTimeSpent(720, 720)).toBe("on-track");
    expect(classifyTimeSpent(650, 720)).toBe("on-track");
    expect(classifyTimeSpent(800, 720)).toBe("on-track");
  });

  it("treats a zero or negative target as always on-track (avoids divide-by-zero weirdness)", () => {
    expect(classifyTimeSpent(500, 0)).toBe("on-track");
  });
});
