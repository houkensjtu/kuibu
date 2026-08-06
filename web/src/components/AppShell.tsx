import { Outlet } from "react-router";
import { TabBar } from "./TabBar";

/** Route content + the always-mounted bottom tab bar. `pb-16` clears the fixed bar so content never sits under it. */
export function AppShell() {
  return (
    <div className="min-h-svh">
      <main className="mx-auto max-w-[65ch] px-4 pb-16 pt-6">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
