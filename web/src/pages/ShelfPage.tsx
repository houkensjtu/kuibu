import { useEffect, useRef, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { listAllBooks } from "@/lib/books";
import type { BookSummary } from "@/lib/books";
import { readBundleFile } from "@/lib/importBundle";
import { putImportedPack, deleteImportedPack } from "@/lib/importedPacksDb";
import { PackLoadError } from "@/lib/packFromCombined";
import { useActiveBook } from "@/lib/ActiveBookProvider";
import { DEFAULT_BOOK_ID } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ImportState = { kind: "idle" } | { kind: "importing" } | { kind: "error"; message: string };

export function ShelfPage() {
  const { activeBookId, setActiveBookId } = useActiveBook();
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [importState, setImportState] = useState<ImportState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setBooks(await listAllBooks());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    try {
      if (!file) return;
      setImportState({ kind: "importing" });

      const record = await readBundleFile(file);

      const existing = books?.find((b) => b.book_id === record.book_id);
      if (existing) {
        const proceed = window.confirm(
          `已有《${existing.title}》(id: ${existing.book_id})。\n导入《${record.title}》将替换它。打卡记录会延续。继续？`,
        );
        if (!proceed) {
          setImportState({ kind: "idle" });
          return;
        }
      }

      await putImportedPack(record);

      // First-import-ever persistence request (web brief pitfall #7): an
      // imported private pack is the only copy in the browser, so ask the
      // browser not to evict it under storage pressure.
      if (navigator.storage?.persist) {
        await navigator.storage.persist();
      }

      await refresh();
      setActiveBookId(record.book_id);
      setImportState({ kind: "idle" });
    } catch (err) {
      const message = err instanceof PackLoadError ? err.message : "导入失败，请确认文件格式正确。";
      setImportState({ kind: "error", message });
    } finally {
      // Otherwise picking the same file again after a delete wouldn't fire
      // another change event, and the picker would silently do nothing.
      e.target.value = "";
    }
  }

  async function handleDelete(book: BookSummary, e: React.MouseEvent) {
    e.stopPropagation();
    const proceed = window.confirm(
      `删除《${book.title}》？\n打卡记录会保留——重新导入这本书就能接上。`,
    );
    if (!proceed) return;

    await deleteImportedPack(book.book_id);
    if (activeBookId === book.book_id) {
      setActiveBookId(DEFAULT_BOOK_ID);
    }
    await refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">Shelf</h1>

      <div className="flex flex-col gap-2">
        {books === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {books?.map((book) => {
          const isActive = book.book_id === activeBookId;
          return (
            // A <button> containing another <button> (the delete control) is
            // invalid HTML, so the row is a div and the select action lives
            // on its own button sibling instead of wrapping the whole row.
            <div
              key={book.book_id}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-lg border transition-colors",
                isActive ? "border-foreground bg-accent" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => setActiveBookId(book.book_id)}
                aria-current={isActive}
                className="flex flex-1 items-center gap-2 px-4 py-2 text-left"
              >
                {isActive && <Check className="size-4 shrink-0 text-foreground" aria-hidden="true" />}
                <span className="flex flex-col">
                  <span className="font-medium text-foreground">{book.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {book.author}
                    {book.source === "imported" && " · Imported"}
                  </span>
                </span>
              </button>
              {book.source === "imported" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="mr-2"
                  aria-label={`Delete ${book.title}`}
                  onClick={(e) => handleDelete(book, e)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={importState.kind === "importing"}
      >
        {importState.kind === "importing" ? "Importing…" : "Import a book…"}
      </Button>

      {importState.kind === "error" && (
        <p className="text-sm text-destructive">{importState.message}</p>
      )}
    </div>
  );
}
