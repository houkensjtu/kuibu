export type ThemePreference = "system" | "light" | "dark";

// Prefixed per web brief pitfall #6: storage is origin-scoped, not
// path-scoped, and every project under this GitHub account shares one origin.
const STORAGE_KEY = "kuibu:theme";

export function getStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // localStorage can throw in some privacy modes -- fall back silently.
  }
  return "system";
}

export function setStoredPreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Best effort; nothing to fall back to if storage is unavailable.
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveEffectiveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return systemPrefersDark() ? "dark" : "light";
}

export function applyEffectiveTheme(effective: "light" | "dark"): void {
  document.documentElement.classList.toggle("dark", effective === "dark");
}
