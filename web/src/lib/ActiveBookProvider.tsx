import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { getStoredActiveBookId, setStoredActiveBookId } from "./activeBook";

interface ActiveBookContextValue {
  activeBookId: string;
  setActiveBookId: (bookId: string) => void;
}

const ActiveBookContext = createContext<ActiveBookContextValue | null>(null);

/**
 * Single source of truth for "which book is Today/Calendar currently
 * showing" -- mirrors ThemeProvider.tsx's shape. Persisted so the choice
 * survives a reload; read by TodayPage/CalendarPage, written by ShelfPage.
 */
export function ActiveBookProvider({ children }: { children: ReactNode }) {
  const [activeBookId, setActiveBookIdState] = useState(() => getStoredActiveBookId());

  function setActiveBookId(bookId: string) {
    setStoredActiveBookId(bookId);
    setActiveBookIdState(bookId);
  }

  return (
    <ActiveBookContext.Provider value={{ activeBookId, setActiveBookId }}>{children}</ActiveBookContext.Provider>
  );
}

export function useActiveBook(): ActiveBookContextValue {
  const ctx = useContext(ActiveBookContext);
  if (!ctx) throw new Error("useActiveBook must be used within an ActiveBookProvider");
  return ctx;
}
