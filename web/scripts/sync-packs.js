// Copies content packs from packs/public/ (the single source of truth,
// shared with the CLI) into web/public/packs/ so Vite serves them as
// static assets the browser can fetch() at runtime -- per DESIGN.md §4.3,
// the reader is supposed to fetch() the pack directly, not bundle it into
// the JS. Runs before every dev/build so web/public/packs/ is always
// regenerated, never hand-copied (a hand copy would drift the moment
// packs/public/sicp/ is rebuilt, per the "stale build artifact" pitfall in
// CLAUDE.md). Deliberately only reads from packs/public/ -- packs/private/
// must never be reachable from here (web brief pitfall #12).
import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// v0.1 ships SICP only (web brief: "明确不做" section) -- add a book id
// here when it's actually wired into the app, not preemptively.
const BOOK_IDS = ["sicp"];

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(webRoot, "..", "packs", "public");
const destRoot = join(webRoot, "public", "packs");

const index = [];

for (const bookId of BOOK_IDS) {
  const srcDir = join(sourceRoot, bookId);
  const destDir = join(destRoot, bookId);
  if (!existsSync(srcDir)) {
    throw new Error(`sync-packs: packs/public/${bookId} does not exist`);
  }

  mkdirSync(destDir, { recursive: true });
  for (const fileName of readdirSync(srcDir)) {
    if (!fileName.endsWith(".json")) continue;
    copyFileSync(join(srcDir, fileName), join(destDir, fileName));
  }

  const manifest = JSON.parse(readFileSync(join(srcDir, "manifest.json"), "utf-8"));
  index.push({ book_id: manifest.book_id, title: manifest.title, author: manifest.author });
}

mkdirSync(destRoot, { recursive: true });
writeFileSync(join(destRoot, "index.json"), JSON.stringify(index, null, 2) + "\n");

console.log(`sync-packs: synced ${BOOK_IDS.join(", ")} into web/public/packs/`);
