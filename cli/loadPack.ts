import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validatePack } from "../core/schemaValidators.js";
import { checkPackReferences } from "../core/checkPackReferences.js";
import type { ContentPack } from "../schema/types/pack.js";

/** 这一版阅读器认识的 schema_version；内容包版本对不上就明确报错，不猜测兼容性。 */
export const SUPPORTED_SCHEMA_VERSION = "0.1.0";

export class PackLoadError extends Error {}

/**
 * 从 packDir 下的 manifest.json/blocks.json/items.json/questions.json
 * 读取并组装成一个内容包，跑 schema 校验，再检查 schema_version 是否兼容。
 * 这是 cli/ 里第一次真正的 IO——对应铁律 3：阅读器只认内容包 schema 这一个契约，
 * 不关心生成器怎么产出这些文件。
 */
export function loadPack(packDir: string): ContentPack {
  const readJson = (fileName: string): unknown => {
    const raw = readFileSync(join(packDir, fileName), "utf-8");
    return JSON.parse(raw);
  };

  const combined = {
    manifest: readJson("manifest.json"),
    blocks: readJson("blocks.json"),
    items: readJson("items.json"),
    questions: readJson("questions.json"),
    exercises: readJson("exercises.json"),
    recap_checkpoints: readJson("recap_checkpoints.json"),
    section_headings: readJson("section_headings.json"),
  };

  const result = validatePack(combined);
  if (!result.valid) {
    throw new PackLoadError(
      `Content pack validation failed (${packDir}):\n${result.errors.join("\n")}`,
    );
  }

  const pack = result.data;
  if (pack.manifest.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new PackLoadError(
      `Incompatible content pack schema_version: pack declares "${pack.manifest.schema_version}", ` +
        `this reader only supports "${SUPPORTED_SCHEMA_VERSION}".`,
    );
  }

  const referenceErrors = checkPackReferences(pack);
  if (referenceErrors.length > 0) {
    throw new PackLoadError(
      `Content pack reference check failed (${packDir}):\n${referenceErrors.join("\n")}`,
    );
  }

  return pack;
}
