import { NavLink } from "react-router";
import { CalendarDays, BookOpen, Library, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", label: "Calendar", icon: CalendarDays, end: true },
  { to: "/today", label: "Today", icon: BookOpen, end: false },
  { to: "/shelf", label: "Shelf", icon: Library, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
] as const;

/**
 * shadcn has no tab-bar primitive -- this is a plain fixed-bottom flex row.
 * Stays mounted across every view (brief: "阅读 session 进行中也在, 不随
 * 滚动隐藏"), so page content needs bottom padding to clear it (see
 * AppShell). `pb-[env(safe-area-inset-bottom)]` keeps it off the iPhone
 * home-indicator bar (pitfall #9).
 */
export function TabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs",
              isActive ? "text-foreground" : "text-muted-foreground",
            )
          }
        >
          <Icon className="size-5" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
