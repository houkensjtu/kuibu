import { describe, it, expect } from "vitest";
import { buildImportRecord } from "./importBundle";
import { PackLoadError } from "./packFromCombined";

function sampleCombined() {
  return {
    manifest: {
      schema_version: "0.1.0",
      book_id: "sjobs",
      title: "史蒂夫·乔布斯传",
      author: "Walter Isaacson",
      license: "All rights reserved",
      source: "local",
      generated_at: "2026-08-01T00:00:00Z",
      generator_version: "0.1.0",
    },
    blocks: [
      {
        id: "b0001",
        seq: 1,
        section_path: ["foreword"],
        section_title: "Foreword",
        content_md: "...",
        est_seconds: 100,
        recap_md: "recap",
      },
    ],
    items: [],
    questions: [],
    exercises: [],
    recap_checkpoints: [],
    section_headings: [],
  };
}

describe("buildImportRecord", () => {
  it("denormalizes manifest fields and stamps the injected clock", () => {
    const now = new Date("2026-08-07T12:00:00Z");
    const record = buildImportRecord(sampleCombined(), 12345, now, "sjobs.kuibu.json");

    expect(record.book_id).toBe("sjobs");
    expect(record.title).toBe("史蒂夫·乔布斯传");
    expect(record.author).toBe("Walter Isaacson");
    expect(record.imported_at).toBe("2026-08-07T12:00:00.000Z");
    expect(record.byte_size).toBe(12345);
  });

  it("stores the pack manifest with exactly its original keys (additionalProperties: false constraint)", () => {
    const record = buildImportRecord(sampleCombined(), 100, new Date(), "test");
    expect(Object.keys(record.pack.manifest).sort()).toEqual(
      Object.keys(sampleCombined().manifest).sort(),
    );
  });

  it("throws PackLoadError for an invalid pack", () => {
    const broken = sampleCombined();
    broken.manifest.schema_version = "0.2.0";
    expect(() => buildImportRecord(broken, 100, new Date(), "test")).toThrow(PackLoadError);
  });
});
