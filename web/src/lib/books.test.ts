import { describe, it, expect } from "vitest";
import { mergeBookLists } from "./books";

describe("mergeBookLists", () => {
  it("returns builtin and imported books when ids don't overlap", () => {
    const builtin = [{ book_id: "sicp", title: "SICP", author: "Abelson & Sussman" }];
    const imported = [{ book_id: "sjobs", title: "史蒂夫·乔布斯传", author: "Walter Isaacson" }];
    const result = mergeBookLists(builtin, imported);
    expect(result).toHaveLength(2);
    expect(result.find((b) => b.book_id === "sicp")?.source).toBe("builtin");
    expect(result.find((b) => b.book_id === "sjobs")?.source).toBe("imported");
  });

  it("shows exactly one row when an imported pack shadows a builtin one", () => {
    const builtin = [{ book_id: "sicp", title: "SICP (old)", author: "Abelson & Sussman" }];
    const imported = [{ book_id: "sicp", title: "SICP (updated)", author: "Abelson & Sussman" }];
    const result = mergeBookLists(builtin, imported);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("imported");
    expect(result[0].title).toBe("SICP (updated)");
  });

  it("returns an empty list when both sources are empty", () => {
    expect(mergeBookLists([], [])).toEqual([]);
  });
});
