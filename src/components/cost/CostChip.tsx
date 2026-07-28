import { Coins } from "lucide-react";
import clsx from "clsx";
import { formatUsd } from "../../lib/money";

/** Small pill showing a USD cost. `estimated` renders it muted with "est.". */
export function CostChip({
  value,
  estimated,
  label,
  className,
}: {
  value: number;
  estimated?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <span
      title={estimated ? "Estimated — no real API call was billed" : "Actual API cost"}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        estimated ? "bg-surface-active text-ink-faint" : "bg-emerald-50 text-emerald-700",
        className,
      )}
    >
      <Coins className="h-3 w-3" />
      {label && <span className="font-normal text-ink-faint">{label}</span>}
      {formatUsd(value)}
      {estimated && <span className="font-normal">est.</span>}
    </span>
  );
}
