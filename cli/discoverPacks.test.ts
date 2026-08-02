import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { discoverPacks, resolvePackDir } from "./discoverPacks.js";
import { PackLoadError } from "./loadPack.js";

function makePackDir(root: string, dirName: string, bookId: string): string {
  const packDir = join(root, dirName);
  mkdirSync(packDir, { recursive: true });
  writeFileSync(join(packDir, "manifest.json"), JSON.stringify({ book_id: bookId }));
  return packDir;
}

describe("discoverPacks", () => {
  it("finds every subdirectory with a manifest.json, across multiple roots", () => {
    const rootA = mkdtempSync(join(tmpdir(), "kuibu-packs-a-"));
    const rootB = mkdtempSync(join(tmpdir(), "kuibu-packs-b-"));
    makePackDir(rootA, "sicp", "sicp");
    makePackDir(rootB, "gatsby", "gatsby");

    const found = discoverPacks([rootA, rootB]);
    expect(found.map((p) => p.bookId).sort()).toEqual(["gatsby", "sicp"]);
  });

  it("skips subdirectories with no manifest.json", () => {
    const root = mkdtempSync(join(tmpdir(), "kuibu-packs-"));
    makePackDir(root, "sicp", "sicp");
    mkdirSync(join(root, "not-a-pack"));

    const found = discoverPacks([root]);
    expect(found).toHaveLength(1);
  });

  it("silently ignores a root that doesn't exist (e.g. packs/private on most machines)", () => {
    expect(discoverPacks(["/no/such/directory"])).toEqual([]);
  });

  it("always joins packDir with forward slashes, even on Windows", () => {
    // node:path's join() uses backslashes on Windows ("packs\public\sicp"),
    // which would silently fail a strict === comparison against a hardcoded
    // "packs/public/sicp" string elsewhere in the codebase (cli/index.ts's
    // defaultLogPath uses exactly that comparison to recognize the default
    // SICP pack) - this regressed once already, catch it for good.
    const root = mkdtempSync(join(tmpdir(), "kuibu-packs-"));
    const packDir = makePackDir(root, "sicp", "sicp");

    const found = discoverPacks([root]);
    expect(found[0].packDir).toBe(`${root.replace(/\\/g, "/")}/sicp`);
    expect(found[0].packDir).not.toContain("\\");
  });
});

describe("resolvePackDir", () => {
  it("returns a full path as-is when it's a real pack directory", () => {
    const root = mkdtempSync(join(tmpdir(), "kuibu-packs-"));
    const packDir = makePackDir(root, "sicp", "sicp");

    expect(resolvePackDir(packDir, [])).toBe(packDir);
  });

  it("resolves a short book id via the discovered list", () => {
    const discovered = [{ bookId: "gatsby", packDir: "packs/public/gatsby" }];
    expect(resolvePackDir("gatsby", discovered)).toBe("packs/public/gatsby");
  });

  it("throws PackLoadError listing known books when nothing matches", () => {
    const discovered = [{ bookId: "sicp", packDir: "packs/public/sicp" }];
    expect(() => resolvePackDir("nope", discovered)).toThrow(PackLoadError);
    expect(() => resolvePackDir("nope", discovered)).toThrow(/sicp/);
  });
});
