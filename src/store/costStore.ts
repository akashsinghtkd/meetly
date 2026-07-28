import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Capability } from "../lib/providers/catalog";

// Every billable API call produces a UsageRecord. This store is the ledger the
// whole UI reads from to show cost "everywhere".

export interface UsageRecord {
  id: string;
  at: string; // ISO
  provider: string;
  model: string;
  kind: Capability;
  meetingId?: string;

  // raw usage captured from the provider response (when available)
  audioSeconds?: number;
  inputTokens?: number;
  outputTokens?: number;

  costUsd: number;
  /** true when no real API call was made (mock / no key) — cost is a projection. */
  estimated?: boolean;
}

interface CostState {
  records: UsageRecord[];
  add: (r: Omit<UsageRecord, "id" | "at">) => void;
  reset: () => void;

  total: () => number;
  estimatedTotal: () => number;
  realTotal: () => number;
  /** Real (billed) spend in the current calendar month — used for the budget. */
  monthRealSpend: () => number;
  byMeeting: (meetingId: string) => number;
  recordsForMeeting: (meetingId: string) => UsageRecord[];
  byProvider: () => { provider: string; costUsd: number; calls: number }[];
}

let seq = 0;

export const useCost = create<CostState>()(
  persist(
    (set, get) => ({
      records: [],

      add: (r) =>
        set((s) => ({
          records: [
            ...s.records,
            { ...r, id: `u-${Date.now().toString(36)}-${seq++}`, at: new Date().toISOString() },
          ],
        })),

      reset: () => set({ records: [] }),

      total: () => get().records.reduce((n, r) => n + r.costUsd, 0),
      estimatedTotal: () =>
        get().records.filter((r) => r.estimated).reduce((n, r) => n + r.costUsd, 0),
      realTotal: () =>
        get().records.filter((r) => !r.estimated).reduce((n, r) => n + r.costUsd, 0),

      monthRealSpend: () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        return get()
          .records.filter((r) => {
            if (r.estimated) return false;
            const d = new Date(r.at);
            return d.getFullYear() === y && d.getMonth() === m;
          })
          .reduce((n, r) => n + r.costUsd, 0);
      },

      byMeeting: (meetingId) =>
        get().records.filter((r) => r.meetingId === meetingId).reduce((n, r) => n + r.costUsd, 0),

      recordsForMeeting: (meetingId) => get().records.filter((r) => r.meetingId === meetingId),

      byProvider: () => {
        const map = new Map<string, { provider: string; costUsd: number; calls: number }>();
        for (const r of get().records) {
          const cur = map.get(r.provider) ?? { provider: r.provider, costUsd: 0, calls: 0 };
          cur.costUsd += r.costUsd;
          cur.calls += 1;
          map.set(r.provider, cur);
        }
        return [...map.values()].sort((a, b) => b.costUsd - a.costUsd);
      },
    }),
    { name: "meetly-cost-ledger" },
  ),
);
