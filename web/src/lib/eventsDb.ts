import type { Event } from "../../../schema/types/events";

const DB_VERSION = 1;
const STORE_NAME = "events";

/**
 * IndexedDB is origin-scoped, not path-scoped (pitfall #6 in the web brief:
 * every project page under the same GitHub account shares one origin), so
 * the DB name is prefixed and includes book_id -- same shape as the CLI's
 * per-book `.kuibu-events-<bookId>.jsonl` files, so adding a second book
 * later is "open a different DB", not a schema change.
 */
function dbNameForBook(bookId: string): string {
  return `kuibu:${bookId}:events`;
}

function openEventsDb(bookId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbNameForBook(bookId), DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Appends one event. `id` is the keyPath, so a re-add with the same id is a no-op overwrite, not a duplicate. */
export async function addEvent(bookId: string, event: Event): Promise<void> {
  const db = await openEventsDb(bookId);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(event);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Reads every event for a book, sorted by `ts`. Sorting happens here rather
 * than relying on IndexedDB key order, because the store's keyPath is the
 * event's own `id` (an opaque string, not chronological) -- the reducer
 * requires chronological order to fold correctly.
 */
export async function getAllEvents(bookId: string): Promise<Event[]> {
  const db = await openEventsDb(bookId);
  try {
    const events = await new Promise<Event[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as Event[]);
      request.onerror = () => reject(request.error);
    });
    return events.sort((a, b) => a.ts.localeCompare(b.ts));
  } finally {
    db.close();
  }
}
