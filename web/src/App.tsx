import { HashRouter, Routes, Route } from "react-router";
import { ThemeProvider } from "@/lib/ThemeProvider";
import { AppShell } from "@/components/AppShell";
import { CalendarPage } from "@/pages/CalendarPage";
import { TodayPage } from "@/pages/TodayPage";
import { ShelfPage } from "@/pages/ShelfPage";
import { SettingsPage } from "@/pages/SettingsPage";

// GitHub Pages serves no server-side routing, so this is a hash router
// (web brief pitfall #11) rather than pathname-based routes.
function App() {
  return (
    <ThemeProvider>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<CalendarPage />} />
            <Route path="today" element={<TodayPage />} />
            <Route path="shelf" element={<ShelfPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
