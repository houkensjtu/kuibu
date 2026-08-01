import { describe, it, expect } from "vitest";
import { parseMinutesInput } from "./targetPrompt.js";

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
