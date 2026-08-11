// Frontend side of calendar integration. Guarded so `npm run dev` in a plain
// browser stays a no-op (the calendar provider only exists under Tauri).

import { inTauri } from "./tauri";

export interface CalEvent {
  id: string;
  title: string;
  /** Unix seconds. */
  start: number;
  end: number;
  attendees: string[];
  location: string | null;
}

export type CalAuth = "granted" | "denied" | "restricted" | "undetermined" | "unknown";

/** Do we already have calendar access? */
export async function calendarAuthorization(): Promise<CalAuth> {
  if (!inTauri()) return "unknown";
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<CalAuth>("calendar_authorization");
}

/** Trigger the OS calendar prompt. Result arrives as a `calendar-permission-result` event. */
export async function requestCalendarAccess(): Promise<void> {
  if (!inTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("request_calendar_access");
}

/** Events from now through `days` ahead. Empty until access is granted. */
export async function upcomingEvents(days = 7): Promise<CalEvent[]> {
  if (!inTauri()) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<CalEvent[]>("upcoming_events", { days });
}

/**
 * The calendar event a recording started "now" most likely belongs to: one that
 * is ongoing (or starts/ended within a few minutes of now). Picks the event
 * whose start is closest to now. `null` when nothing lines up.
 */
export function currentEvent(events: CalEvent[], nowSec = Date.now() / 1000): CalEvent | null {
  const LEAD = 5 * 60; // may start recording a few min before the scheduled start
  const LAG = 5 * 60; // …or a few min after it ended
  const candidates = events.filter((e) => nowSec >= e.start - LEAD && nowSec <= e.end + LAG);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, e) =>
    Math.abs(e.start - nowSec) < Math.abs(best.start - nowSec) ? e : best,
  );
}
