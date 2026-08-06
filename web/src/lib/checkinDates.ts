import type { Event } from "../../../schema/types/events";

/**
 * Pulls the checked-in dates out of a raw event list -- a 3-line filter, not
 * worth promoting to core/reducer.ts's full reduceEvents (which also needs
 * a questionItemMap from the loaded pack, more than the calendar needs).
 */
export function checkinDatesFromEvents(events: readonly Event[]): Set<string> {
  const dates = new Set<string>();
  for (const event of events) {
    if (event.type === "checkin") dates.add(event.date);
  }
  return dates;
}
