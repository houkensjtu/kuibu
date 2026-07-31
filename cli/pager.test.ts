import { describe, it, expect } from "vitest";
import { tryPager } from "./pager.js";

describe("tryPager", () => {
  it("returns false when the pager command doesn't exist", () => {
    expect(tryPager("some text", "this-command-definitely-does-not-exist-12345")).toBe(false);
  });

  // Deliberately not testing the real `less` success path or the stdin-based fallback
  // prompt here: both need an actual interactive terminal, and driving a real pager
  // (or waiting on stdin) inside an automated test runner risks hanging the suite.
  // Verify those by hand: `npm run dev -- today` in a real terminal.
});
