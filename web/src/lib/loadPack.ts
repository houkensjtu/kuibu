import type { ContentPack } from "../../../schema/types/pack";
import { packFromCombined, PackLoadError, SUPPORTED_SCHEMA_VERSION } from "./packFromCombined";
import { getImportedPack } from "./importedPacksDb";

export { PackLoadError, SUPPORTED_SCHEMA_VERSION };

/**
 * Browser counterpart to cli/loadPack.ts: same manifest/blocks/items/
 * questions/exercises/recap_checkpoints/section_headings assembly and the
 * same schema_version gate (now shared via packFromCombined.ts), but
 * fetch() over the static files scripts/sync-packs.js copied into
 * public/packs/<bookId>/ (DESIGN.md §4.3: the reader fetches the pack
 * directly, it doesn't bundle it).
 */
export async function fetchBuiltinPack(bookId: string): Promise<ContentPack> {
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
  return packFromCombined(combined, bookId);
}

/**
 * Resolves a book id to a pack: an imported pack (stored in IndexedDB,
 * see importedPacksDb.ts) wins over a built-in one with the same id --
 * importing is an explicit user act, and it doubles as "fix a broken
 * built-in pack without a redeploy". Deleting the imported copy falls
 * back to the built-in transparently.
 */
export async function loadPack(bookId: string): Promise<ContentPack> {
  const imported = await getImportedPack(bookId);
  if (imported) return imported;
  return fetchBuiltinPack(bookId);
}
