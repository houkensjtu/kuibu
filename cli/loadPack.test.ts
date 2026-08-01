import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { loadPack, PackLoadError, SUPPORTED_SCHEMA_VERSION } from "./loadPack.js";

const SAMPLE_PACK_DIR = join(
  import.meta.dirname,
  "..",
  "schema",
  "examples",
  "sample-pack",
);

function copySamplePackTo(dir: string, patchManifest: Record<string, unknown> = {}) {
  for (const name of ["blocks.json", "items.json", "questions.json", "exercises.json", "recap_checkpoints.json", "section_headings.json"]) {
    writeFileSync(join(dir, name), readFileSync(join(SAMPLE_PACK_DIR, name)));
  }
  const manifest = JSON.parse(
    readFileSync(join(SAMPLE_PACK_DIR, "manifest.json"), "utf-8"),
  );
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({ ...manifest, ...patchManifest }),
  );
}

describe("loadPack", () => {
  it("loads and validates the sample pack fixture", () => {
    const pack = loadPack(SAMPLE_PACK_DIR);
    expect(pack.manifest.book_id).toBe("sicp");
    expect(pack.blocks).toHaveLength(3);
  });

  it("throws PackLoadError with a clear message on schema_version mismatch", () => {
    const dir = mkdtempSync(join(tmpdir(), "kuibu-pack-"));
    copySamplePackTo(dir, { schema_version: "99.0.0" });

    expect(() => loadPack(dir)).toThrow(PackLoadError);
    expect(() => loadPack(dir)).toThrow(/99\.0\.0/);
    expect(() => loadPack(dir)).toThrow(new RegExp(SUPPORTED_SCHEMA_VERSION));
  });

  it("throws PackLoadError with a clear message when a required field is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "kuibu-pack-"));
    copySamplePackTo(dir);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8"));
    delete manifest.title;
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));

    expect(() => loadPack(dir)).toThrow(PackLoadError);
    expect(() => loadPack(dir)).toThrow(/title/);
  });
});
