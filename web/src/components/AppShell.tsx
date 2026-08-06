import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { useRegisterSW } from "virtual:pwa-register/react";
import { TabBar } from "./TabBar";
import { InstallPrompt } from "./InstallPrompt";

/**
 * Applies a pending service-worker update only once the user is idle on
 * the Calendar tab (route "/") -- never mid-reading or mid-answering (web
 * brief pitfall #5: an autoUpdate-style reload would blow away scroll
 * position and unsaved answer state). `needRefresh` just sits there true
 * until that condition is met, however long that takes.
 */
function usePwaUpdater() {
  const location = useLocation();
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    if (needRefresh && location.pathname === "/") {
      updateServiceWorker(true);
    }
  }, [needRefresh, location.pathname, updateServiceWorker]);
}

/** Route content + the always-mounted bottom tab bar. `pb-16` clears the fixed bar so content never sits under it. */
export function AppShell() {
  usePwaUpdater();

  return (
    <div className="min-h-svh">
      <main className="mx-auto max-w-[65ch] px-4 pb-16 pt-6">
        <InstallPrompt />
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
