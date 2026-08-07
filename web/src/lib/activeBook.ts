import { DEFAULT_BOOK_ID } from "./config";

// Prefixed per web brief pitfall #6: storage is origin-scoped, not
// path-scoped, and every project under this GitHub account shares one origin.
const STORAGE_KEY = "kuibu:active-book";

export function getStoredActiveBookId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // localStorage can throw in some privacy modes -- fall back silently.
  }
  return DEFAULT_BOOK_ID;
}

export function setStoredActiveBookId(bookId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, bookId);
  } catch {
    // Best effort; nothing to fall back to if storage is unavailable.
  }
}
