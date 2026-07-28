import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePref = "light" | "dark" | "system";

interface ThemeState {
  /** What the user chose. "system" follows the OS. */
  pref: ThemePref;
  /** The theme actually applied right now ("light" | "dark"). */
  resolved: "light" | "dark";
  setPref: (pref: ThemePref) => void;
  /** Attach OS listener + apply. Call once on app start. */
  init: () => void;
}

function systemDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
}

function resolve(pref: ThemePref): "light" | "dark" {
  if (pref === "system") return systemDark() ? "dark" : "light";
  return pref;
}

function apply(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolved);
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      pref: "system",
      resolved: resolve("system"),

      setPref: (pref) => {
        const resolved = resolve(pref);
        apply(resolved);
        set({ pref, resolved });
      },

      init: () => {
        const resolved = resolve(get().pref);
        apply(resolved);
        set({ resolved });
        if (typeof window !== "undefined" && window.matchMedia) {
          const mq = window.matchMedia("(prefers-color-scheme: dark)");
          mq.addEventListener?.("change", () => {
            if (get().pref !== "system") return;
            const next = systemDark() ? "dark" : "light";
            apply(next);
            set({ resolved: next });
          });
        }
      },
    }),
    {
      name: "meetly-theme",
      partialize: (s) => ({ pref: s.pref }),
      onRehydrateStorage: () => (state) => {
        // Apply the persisted preference as soon as it's read back.
        state?.init();
      },
    },
  ),
);
