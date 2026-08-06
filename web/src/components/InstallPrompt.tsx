import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "kuibu:install-prompt-dismissed";

// Chrome/Edge/Android-only, not yet part of the standard DOM lib types.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ reports as "MacIntel" but is touch-capable, unlike a real Mac.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Best effort -- worst case the banner reappears next visit.
  }
}

/**
 * One-time install banner (web brief §PWA: "首次访问弹一次性安装提示卡").
 * Chrome/Edge/Android get a real install button via `beforeinstallprompt`;
 * iOS Safari doesn't support that event at all, so it gets share-sheet
 * instructions instead, shown unconditionally (no event to wait for).
 * Never shown if already running installed (standalone), or once dismissed.
 */
export function InstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return;

    if (isIOS()) {
      setShowIOSInstructions(true);
      return;
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredEvent(event as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  function handleDismiss() {
    dismiss();
    setDismissed(true);
  }

  async function handleInstall() {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    await deferredEvent.userChoice; // accepted or dismissed, either way don't ask again
    dismiss();
    setDismissed(true);
    setDeferredEvent(null);
  }

  if (dismissed || (!deferredEvent && !showIOSInstructions)) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
      <p className="text-sm text-foreground">
        {deferredEvent
          ? "Install kuibu for quicker daily access."
          : "Add kuibu to your Home Screen: tap Share, then “Add to Home Screen.”"}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {deferredEvent && (
          <Button size="sm" onClick={handleInstall}>
            Install
          </Button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
