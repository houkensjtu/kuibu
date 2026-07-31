import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { validatePack } from "../../core/schemaValidators.js";

const SAMPLE_PACK_DIR = fileURLToPath(
  new URL("./sample-pack/", import.meta.url),
);

function loadSamplePack() {
  const readJson = (name: string) =>
    JSON.parse(readFileSync(SAMPLE_PACK_DIR + name, "utf-8"));

  return {
    manifest: readJson("manifest.json"),
    blocks: readJson("blocks.json"),
    items: readJson("items.json"),
    questions: readJson("questions.json"),
  };
}

describe("sample-pack fixture", () => {
  it("validates against pack.schema.json", () => {
    const result = validatePack(loadSamplePack());
    expect(result.valid).toBe(true);
    expect(result.data?.blocks).toHaveLength(3);
    expect(result.data?.items).toHaveLength(2);
    expect(result.data?.questions).toHaveLength(2);
  });

  it("rejects the fixture once a field is corrupted", () => {
    const pack = loadSamplePack();
    // est_seconds must be an integer >= 1; corrupt it to a string.
    pack.blocks[0].est_seconds = "not-a-number";

    const result = validatePack(pack);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toMatch(/est_seconds/);
  });
});
