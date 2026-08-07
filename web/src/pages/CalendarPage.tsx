import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { buildYearCalendar } from "../../../core/yearCalendar";
import type { YearCalendar } from "../../../core/yearCalendar";
import { computeCurrentStreak } from "../../../core/streak";
import { checkinDate } from "../../../core/checkinDate";
import { getAllEvents } from "@/lib/eventsDb";
import { checkinDatesFromEvents } from "@/lib/checkinDates";
import { useActiveBook } from "@/lib/ActiveBookProvider";
import { cn } from "@/lib/utils";

const YEAR = new Date().getFullYear();
const GAP_PX = 2;
const MIN_CELL_PX = 3;
const MAX_CELL_PX = 16;
const LABEL_ROW_PX = 12;

/**
 * Square cell size that makes `weekCount` columns (plus their gaps) exactly
 * fill `containerWidth` -- the calendar must fit with no horizontal scroll
 * on phone or desktop (user feedback: scrolling to see the year was "less
 * than ideal"), so cell size is derived from available width instead of
 * being a fixed pixel value.
 */
function fitCellSize(containerWidth: number, weekCount: number): number {
  if (containerWidth <= 0 || weekCount <= 0) return MIN_CELL_PX;
  const raw = (containerWidth - GAP_PX * (weekCount - 1)) / weekCount;
  return Math.min(MAX_CELL_PX, Math.max(MIN_CELL_PX, Math.floor(raw)));
}

export function CalendarPage() {
  const location = useLocation();
  const { activeBookId } = useActiveBook();
  const [calendar, setCalendar] = useState<YearCalendar | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // TodayPage navigates here with { justCheckedIn: true } right after
  // writing the checkin event (web brief §"收尾": "年历上今日格点亮 + 连续
  // 天数 +1 给一个约 200ms 的过渡 -- 这是整个流程唯一的成就时刻"). Captured
  // once via useState's lazy initializer so it survives this component's
  // own re-renders but doesn't reappear on a later revisit/reload.
  const [justCheckedIn] = useState(() => Boolean((location.state as { justCheckedIn?: boolean } | null)?.justCheckedIn));
  const today = useState(() => checkinDate(new Date()))[0];

  useEffect(() => {
    let cancelled = false;
    // Reset on a book switch so the previous book's calendar/streak don't
    // flash while the new book's events are still loading.
    setCalendar(null);
    setStreak(null);
    getAllEvents(activeBookId).then((events) => {
      if (cancelled) return;
      const checkinDates = checkinDatesFromEvents(events);
      setCalendar(buildYearCalendar(checkinDates, YEAR));
      setStreak(computeCurrentStreak(checkinDates, today));
    });
    return () => {
      cancelled = true;
    };
  }, [today, activeBookId]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Measure synchronously before paint so the grid doesn't flash at
    // MIN_CELL_PX on first render, then jump to its real size.
    setContainerWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const checkedInCount = calendar
    ? calendar.weeks.flatMap((w) => w.days).filter((d) => d.inYear && d.checkedIn).length
    : 0;
  const cellSize = calendar ? fitCellSize(containerWidth, calendar.weeks.length) : MIN_CELL_PX;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">{YEAR}</h1>

      {streak !== null && (
        <p className={cn("text-2xl font-semibold text-foreground", justCheckedIn && "animate-checkin-pop")}>
          {streak} day{streak === 1 ? "" : "s"} streak
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {calendar ? `${checkedInCount} day${checkedInCount === 1 ? "" : "s"} checked in this year` : "Loading…"}
      </p>

      <div ref={containerRef} className="w-full">
        {calendar && (
          <div
            className="grid gap-[2px]"
            style={{
              gridTemplateRows: `${LABEL_ROW_PX}px repeat(7, ${cellSize}px)`,
              gridAutoFlow: "column",
              gridAutoColumns: `${cellSize}px`,
            }}
          >
            {calendar.weeks.map((week, weekIndex) => {
              const monthLabel = calendar.monthLabels.find((m) => m.weekIndex === weekIndex);
              return (
                <Fragment key={weekIndex}>
                  <div className="relative h-full text-[9px] leading-[9px] text-muted-foreground">
                    {monthLabel && <span className="absolute left-0 top-0 whitespace-nowrap">{monthLabel.label}</span>}
                  </div>
                  {week.days.map((day) => (
                    <div
                      key={day.date}
                      title={day.inYear ? day.date : undefined}
                      className={cn(
                        "rounded-[2px]",
                        !day.inYear && "bg-transparent",
                        day.inYear && day.checkedIn && "bg-foreground",
                        day.inYear && !day.checkedIn && "bg-muted",
                        justCheckedIn && day.date === today && "animate-checkin-pop",
                      )}
                    />
                  ))}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
