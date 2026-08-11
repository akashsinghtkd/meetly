import { create } from "zustand";
import {
  type CalAuth,
  type CalEvent,
  calendarAuthorization,
  requestCalendarAccess,
  upcomingEvents,
} from "../lib/calendar";

// Live calendar state. Not persisted — events come straight from the OS each
// time we refresh, so there's nothing to cache across launches.
interface CalendarState {
  auth: CalAuth;
  events: CalEvent[];
  loading: boolean;
  /** Re-read authorization + upcoming events from the OS. */
  refresh: () => Promise<void>;
  /** Prompt for access; the grant result comes back via an event → refresh. */
  connect: () => Promise<void>;
}

export const useCalendar = create<CalendarState>((set) => ({
  auth: "unknown",
  events: [],
  loading: false,

  refresh: async () => {
    set({ loading: true });
    try {
      const auth = await calendarAuthorization();
      const events = auth === "granted" ? await upcomingEvents(7) : [];
      set({ auth, events });
    } catch (e) {
      console.error("[calendar] refresh failed:", e);
    } finally {
      set({ loading: false });
    }
  },

  connect: async () => {
    try {
      await requestCalendarAccess();
    } catch (e) {
      console.error("[calendar] access request failed:", e);
    }
  },
}));
