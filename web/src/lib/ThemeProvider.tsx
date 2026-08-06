import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  applyEffectiveTheme,
  getStoredPreference,
  resolveEffectiveTheme,
  setStoredPreference,
  systemPrefersDark,
} from "./theme";
import type { ThemePreference } from "./theme";

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Single source of truth for the three-state theme (system/light/dark),
 * mounted once at the app root so it keeps applying `.dark` even while the
 * user is on a tab that isn't Settings -- e.g. the OS switching themes
 * mid-session should still be reflected immediately (web brief: "监听
 * matchMedia(...) 的变化").index.html's inline script already applied the
 * class before first paint; this effect just keeps it in sync afterward.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => getStoredPreference());

  useEffect(() => {
    applyEffectiveTheme(resolveEffectiveTheme(preference));

    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyEffectiveTheme(systemPrefersDark() ? "dark" : "light");
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [preference]);

  function setPreference(next: ThemePreference) {
    setStoredPreference(next);
    setPreferenceState(next);
  }

  return <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
