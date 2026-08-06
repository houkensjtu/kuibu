import { Fragment, useEffect, useState } from "react";
import { buildYearCalendar } from "../../../core/yearCalendar";
import type { YearCalendar } from "../../../core/yearCalendar";
import { getAllEvents } from "@/lib/eventsDb";
import { checkinDatesFromEvents } from "@/lib/checkinDates";
import { BOOK_ID } from "@/lib/config";
import { cn } from "@/lib/utils";

const YEAR = new Date().getFullYear();

export function CalendarPage() {
  const [calendar, setCalendar] = useState<YearCalendar | null>(null);

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

  const checkedInCount = calendar
    ? calendar.weeks.flatMap((w) => w.days).filter((d) => d.inYear && d.checkedIn).length
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">{YEAR}</h1>
      <p className="text-sm text-muted-foreground">
        {calendar ? `${checkedInCount} day${checkedInCount === 1 ? "" : "s"} checked in` : "Loading…"}
      </p>

      {calendar && (
        <div className="overflow-x-auto pb-2">
          <div
            className="grid w-max gap-[2px]"
            style={{
              gridTemplateRows: "repeat(8, 11px)",
              gridAutoFlow: "column",
              gridAutoColumns: "11px",
            }}
          >
            {calendar.weeks.map((week, weekIndex) => {
              const monthLabel = calendar.monthLabels.find((m) => m.weekIndex === weekIndex);
              return (
                <Fragment key={weekIndex}>
                  <div className="relative h-[11px] text-[9px] leading-[11px] text-muted-foreground">
                    {monthLabel && <span className="absolute left-0 whitespace-nowrap">{monthLabel.label}</span>}
                  </div>
                  {week.days.map((day) => (
                    <div
                      key={day.date}
                      title={day.inYear ? day.date : undefined}
                      className={cn(
                        "size-[11px] rounded-[2px]",
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
        </div>
      )}
    </div>
  );
}
