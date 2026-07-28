// USD formatting tuned for tiny per-API-call costs.

export function formatUsd(value: number, opts?: { compact?: boolean }): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) {
    // show enough precision for sub-cent API costs
    const s = value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    return `$${s}`;
  }
  if (opts?.compact && value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(value < 1 ? 4 : 2)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
