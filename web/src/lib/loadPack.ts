import { validatePack } from "../../../core/schemaValidators";
import type { ContentPack } from "../../../schema/types/pack";

/** Mirrors cli/loadPack.ts's SUPPORTED_SCHEMA_VERSION -- keep the two in sync by hand until schema_version bumps often enough to be worth sharing. */
export const SUPPORTED_SCHEMA_VERSION = "0.1.0";

export class PackLoadError extends Error {}

/**
 * Browser counterpart to cli/loadPack.ts: same manifest/blocks/items/
 * questions/exercises/recap_checkpoints/section_headings assembly and the
 * same schema_version gate, but fetch() over the static files
 * scripts/sync-packs.js copied into public/packs/<bookId>/ (DESIGN.md
 * §4.3: the reader fetches the pack directly, it doesn't bundle it).
 */
export async function loadPack(bookId: string): Promise<ContentPack> {
  const base = `${import.meta.env.BASE_URL}packs/${bookId}/`;

  const fetchJson = async (fileName: string): Promise<unknown> => {
    const res = await fetch(`${base}${fileName}`);
    if (!res.ok) {
      throw new PackLoadError(`Failed to fetch ${base}${fileName}: HTTP ${res.status}`);
    }
    return res.json();
  };

  const [manifest, blocks, items, questions, exercises, recap_checkpoints, section_headings] =
    await Promise.all([
      fetchJson("manifest.json"),
      fetchJson("blocks.json"),
      fetchJson("items.json"),
      fetchJson("questions.json"),
      fetchJson("exercises.json"),
      fetchJson("recap_checkpoints.json"),
      fetchJson("section_headings.json"),
    ]);

  const combined = { manifest, blocks, items, questions, exercises, recap_checkpoints, section_headings };

  const result = validatePack(combined);
  if (!result.valid) {
    throw new PackLoadError(`Content pack validation failed (${bookId}):\n${result.errors.join("\n")}`);
  }

  const pack = result.data;
  if (pack.manifest.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new PackLoadError(
      `Incompatible content pack schema_version: pack declares "${pack.manifest.schema_version}", ` +
        `this reader only supports "${SUPPORTED_SCHEMA_VERSION}".`,
    );
  }

  return pack;
}
