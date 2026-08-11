import { CalendarClock, RefreshCw, Users } from "lucide-react";
import { useCalendar } from "../store/calendarStore";
import { inTauri } from "../lib/tauri";
import type { CalEvent } from "../lib/calendar";

/** "Thu, Aug 14 · 2:00–2:30 PM" from unix-second bounds. */
function formatRange(startSec: number, endSec: number): string {
  const start = new Date(startSec * 1000);
  const end = new Date(endSec * 1000);
  const day = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time(start)}–${time(end)}`;
}

/**
 * The next few meetings from the user's calendar, shown atop the meetings list.
 * Desktop-only (the provider is native); a no-op in the browser. When access
 * hasn't been granted it shows a one-tap connect prompt instead.
 */
export function UpcomingMeetings() {
  const auth = useCalendar((s) => s.auth);
  const events = useCalendar((s) => s.events);
  const loading = useCalendar((s) => s.loading);
  const connect = useCalendar((s) => s.connect);

  if (!inTauri()) return null;

  if (auth !== "granted") {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-line bg-surface-sidebar/50 p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <CalendarClock className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink">Connect your calendar</div>
          <div className="text-xs text-ink-faint">
            See upcoming meetings and auto-title recordings with the right attendees.
          </div>
        </div>
        <button
          onClick={() => connect()}
          className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Connect
        </button>
      </div>
    );
  }

  if (events.length === 0) return null;

  return (
    <div className="mb-7">
      <div className="mb-2.5 flex items-center gap-1.5">
        <CalendarClock className="h-4 w-4 text-ink-faint" />
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-light">Upcoming</h2>
        <span className="text-xs tabular-nums text-ink-faint">{events.length}</span>
        {loading && <RefreshCw className="h-3 w-3 animate-spin text-ink-faint" />}
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {events.slice(0, 6).map((ev) => (
          <UpcomingRow key={ev.id} ev={ev} />
        ))}
      </ul>
    </div>
  );
}

function UpcomingRow({ ev }: { ev: CalEvent }) {
  return (
    <li className="px-4 py-3">
      <div className="min-w-0">
        <div className="truncate font-medium text-ink">{ev.title || "Untitled event"}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-faint">
          <span>{formatRange(ev.start, ev.end)}</span>
          {ev.attendees.length > 0 && (
            <span className="inline-flex max-w-[220px] items-center gap-1 truncate">
              <Users className="h-3 w-3 shrink-0" />
              {ev.attendees.slice(0, 3).join(", ")}
              {ev.attendees.length > 3 ? ` +${ev.attendees.length - 3}` : ""}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
