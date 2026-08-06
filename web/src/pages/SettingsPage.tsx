import { useTheme } from "@/lib/ThemeProvider";
import type { ThemePreference } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function SettingsPage() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-foreground">Appearance</h2>
        <div className="flex gap-2">
          {THEME_OPTIONS.map(({ value, label }) => (
            <Button
              key={value}
              type="button"
              variant={preference === value ? "default" : "secondary"}
              className={cn("flex-1", preference === value && "border border-foreground")}
              onClick={() => setPreference(value)}
              aria-pressed={preference === value}
            >
              {label}
            </Button>
          ))}
        </div>
      </section>

      <p className="text-sm text-muted-foreground">Daily reading target lands in a later update.</p>
    </div>
  );
}
