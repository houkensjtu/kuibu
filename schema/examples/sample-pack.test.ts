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
    exercises: readJson("exercises.json"),
    recap_checkpoints: readJson("recap_checkpoints.json"),
  };
}

describe("sample-pack fixture", () => {
  it("validates against pack.schema.json", () => {
    const result = validatePack(loadSamplePack());
    if (!result.valid) throw new Error(result.errors.join("\n"));
    expect(result.data.blocks).toHaveLength(3);
    expect(result.data.items).toHaveLength(2);
    expect(result.data.questions).toHaveLength(2);
    expect(result.data.exercises).toHaveLength(1);
    expect(result.data.recap_checkpoints).toHaveLength(1);
  });

  it("rejects the fixture once a field is corrupted", () => {
    const pack = loadSamplePack();
    // est_seconds must be an integer >= 1; corrupt it to a string.
    pack.blocks[0].est_seconds = "not-a-number";

    const result = validatePack(pack);
    if (result.valid) throw new Error("expected validation to fail");
    expect(result.errors[0]).toMatch(/est_seconds/);
  });
});
