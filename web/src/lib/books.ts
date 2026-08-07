import { listImportedPacks } from "./importedPacksDb";

export type BookSource = "builtin" | "imported";

export interface BookSummary {
  book_id: string;
  title: string;
  author: string;
  source: BookSource;
}

interface BuiltinIndexEntry {
  book_id: string;
  title: string;
  author: string;
}

/**
 * web/scripts/sync-packs.js already writes this file (one entry per book in
 * its BOOK_IDS allowlist) -- this is its first actual reader, closing web
 * brief pitfall #10 ("浏览器不能扫目录", the sanctioned replacement is a
 * build-time-generated index). Returns [] on any fetch failure (offline,
 * or the PWA hasn't precached it -- pack JSON isn't in the service worker's
 * precache list) so imported books still render on the Shelf.
 */
export async function fetchBuiltinIndex(): Promise<BuiltinIndexEntry[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}packs/index.json`);
    if (!res.ok) return [];
    return (await res.json()) as BuiltinIndexEntry[];
  } catch {
    return [];
  }
}

/**
 * Merges built-in and imported book lists by book_id. An imported pack with
 * the same id as a built-in one shadows it entirely (one row, source
 * "imported") -- matches loadPack's "imported wins" resolution so the
 * Shelf never shows two rows for what's really one active book.
 */
export function mergeBookLists(
  builtin: readonly BuiltinIndexEntry[],
  imported: readonly { book_id: string; title: string; author: string }[],
): BookSummary[] {
  const importedIds = new Set(imported.map((b) => b.book_id));
  const builtinRows: BookSummary[] = builtin
    .filter((b) => !importedIds.has(b.book_id))
    .map((b) => ({ ...b, source: "builtin" as const }));
  const importedRows: BookSummary[] = imported.map((b) => ({ ...b, source: "imported" as const }));
  return [...builtinRows, ...importedRows];
}

export async function listAllBooks(): Promise<BookSummary[]> {
  const [builtin, imported] = await Promise.all([fetchBuiltinIndex(), listImportedPacks()]);
  return mergeBookLists(builtin, imported);
}
