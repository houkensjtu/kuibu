import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { buildYearCalendar } from "../../../core/yearCalendar";
import type { YearCalendar } from "../../../core/yearCalendar";
import { getAllEvents } from "@/lib/eventsDb";
import { checkinDatesFromEvents } from "@/lib/checkinDates";
import { BOOK_ID } from "@/lib/config";
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
  const [calendar, setCalendar] = useState<YearCalendar | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getAllEvents(BOOK_ID).then((events) => {
      if (cancelled) return;
      const checkinDates = checkinDatesFromEvents(events);
      setCalendar(buildYearCalendar(checkinDates, YEAR));
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      <p className="text-sm text-muted-foreground">
        {calendar ? `${checkedInCount} day${checkedInCount === 1 ? "" : "s"} checked in` : "Loading…"}
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
