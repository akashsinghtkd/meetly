// Money-control helpers: read the monthly budget vs. real month-to-date spend.
// `blocked` is true only when a hard cap is on AND the budget is exceeded —
// that's the signal that stops new API spend.

import { useSettings } from "../store/settingsStore";
import { useCost } from "../store/costStore";

export interface BudgetStatus {
  spent: number;
  budget: number | null;
  hardCap: boolean;
  fraction: number; // 0..>1
  warn: boolean; // >= 80%
  over: boolean; // >= 100%
  blocked: boolean; // over AND hardCap → stop spending
}

export function budgetStatus(): BudgetStatus {
  const { monthlyBudgetUsd, hardCap } = useSettings.getState();
  const spent = useCost.getState().monthRealSpend();
  const budget = monthlyBudgetUsd;
  const fraction = budget && budget > 0 ? spent / budget : 0;
  const over = budget != null && spent >= budget;
  return {
    spent,
    budget,
    hardCap,
    fraction,
    warn: budget != null && fraction >= 0.8,
    over,
    blocked: over && hardCap,
  };
}
