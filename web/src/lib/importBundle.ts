import { packFromCombined, PackLoadError } from "./packFromCombined";
import type { ImportedPackRecord } from "./importedPacksDb";

/**
 * Pure assembly step, separated from file IO so it's testable without a
 * File/FileReader: validates + version-gates + reference-checks the parsed
 * JSON (via packFromCombined), then denormalizes manifest fields onto the
 * wrapper record (schema/pack.schema.json's additionalProperties:false on
 * both root and manifest means imported_at/byte_size can't live inside the
 * pack itself -- see importedPacksDb.ts). `now` is injected so tests are
 * deterministic, same discipline as core/'s clock injection.
 */
export function buildImportRecord(json: unknown, byteSize: number, now: Date, sourceLabel: string): ImportedPackRecord {
  const pack = packFromCombined(json, sourceLabel);
  return {
    book_id: pack.manifest.book_id,
    title: pack.manifest.title,
    author: pack.manifest.author,
    imported_at: now.toISOString(),
    byte_size: byteSize,
    pack,
  };
}

/** Reads a picked File and turns it into an ImportedPackRecord, or throws PackLoadError with a friendly message. */
export async function readBundleFile(file: File): Promise<ImportedPackRecord> {
  const text = await file.text();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PackLoadError(`"${file.name}" 不是有效的 JSON 文件。`);
  }

  return buildImportRecord(json, file.size, new Date(), file.name);
}
