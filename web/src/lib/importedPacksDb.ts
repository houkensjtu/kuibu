import type { ContentPack } from "../../../schema/types/pack";

const DB_NAME = "kuibu:imported-packs";
const DB_VERSION = 1;
const PACKS_STORE = "packs";
const META_STORE = "packMeta";

/** Denormalized from manifest so the Shelf can list books without deserializing every ~400KB pack. */
export interface ImportedPackMeta {
  book_id: string;
  title: string;
  author: string;
  imported_at: string;
  byte_size: number;
}

/**
 * schema/pack.schema.json has `additionalProperties: false` on both the root
 * and `manifest`, so import metadata (imported_at, byte_size) can't live
 * inside the pack -- it's a sibling field on this wrapper instead. `pack` is
 * stored verbatim, exactly as packFromCombined validated it.
 */
export interface ImportedPackRecord extends ImportedPackMeta {
  pack: ContentPack;
}

function openImportedPacksDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PACKS_STORE)) {
        db.createObjectStore(PACKS_STORE, { keyPath: "book_id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "book_id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Two stores (heavy pack vs. light metadata) written in one transaction so they can't drift out of sync. */
export async function putImportedPack(record: ImportedPackRecord): Promise<void> {
  const { pack, ...meta } = record;
  const db = await openImportedPacksDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([PACKS_STORE, META_STORE], "readwrite");
      tx.objectStore(PACKS_STORE).put({ book_id: record.book_id, pack });
      tx.objectStore(META_STORE).put(meta);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getImportedPack(bookId: string): Promise<ContentPack | null> {
  const db = await openImportedPacksDb();
  try {
    const record = await new Promise<{ book_id: string; pack: ContentPack } | undefined>((resolve, reject) => {
      const request = db.transaction(PACKS_STORE, "readonly").objectStore(PACKS_STORE).get(bookId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return record?.pack ?? null;
  } finally {
    db.close();
  }
}

export async function listImportedPacks(): Promise<ImportedPackMeta[]> {
  const db = await openImportedPacksDb();
  try {
    return await new Promise<ImportedPackMeta[]>((resolve, reject) => {
      const request = db.transaction(META_STORE, "readonly").objectStore(META_STORE).getAll();
      request.onsuccess = () => resolve(request.result as ImportedPackMeta[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteImportedPack(bookId: string): Promise<void> {
  const db = await openImportedPacksDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([PACKS_STORE, META_STORE], "readwrite");
      tx.objectStore(PACKS_STORE).delete(bookId);
      tx.objectStore(META_STORE).delete(bookId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
