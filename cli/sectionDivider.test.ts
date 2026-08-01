import { describe, it, expect, vi } from "vitest";
import { printSectionDivider } from "./sectionDivider.js";

describe("printSectionDivider", () => {
  it("prints the label surrounded by rule lines", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    printSectionDivider("Reading");
    const output = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Reading");
    expect(output).toMatch(/=+/);
    logSpy.mockRestore();
  });
});
