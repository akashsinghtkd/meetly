import type { ReactNode } from "react";
import { Mic } from "lucide-react";
import clsx from "clsx";

/** Primary / secondary / ghost buttons — one visual system app-wide. */
export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  className,
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  type?: "button" | "submit";
  title?: string;
}) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary" && "bg-accent text-white hover:bg-accent-hover",
        variant === "secondary" &&
          "border border-line bg-surface text-ink hover:bg-surface-hover",
        variant === "ghost" && "text-ink-light hover:bg-surface-hover hover:text-ink",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  /** Render the icon as-is (it supplies its own frame) instead of the grey tile. */
  bare = false,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  bare?: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-sidebar/60 py-16 px-6 text-center">
      {bare ? (
        <div className="mb-5 grid place-items-center">{icon}</div>
      ) : (
        <div className="mx-auto mb-4 h-11 w-11 rounded-xl bg-surface-active grid place-items-center text-ink-light">
          {icon}
        </div>
      )}
      <p className="text-ink font-semibold mb-1">{title}</p>
      <p className="text-ink-light text-sm max-w-sm mx-auto mb-5">{description}</p>
      {action}
    </div>
  );
}

/**
 * The product's signature recording affordance: a confident accent disc with a
 * mic, wrapped in a soft ring — and, while live, a pulsing halo. Replaces the
 * flat grey-tile lucide mic that read as a placeholder.
 */
export function RecordGlyph({
  size = "md",
  live = false,
  className,
}: {
  size?: "sm" | "md" | "lg";
  live?: boolean;
  className?: string;
}) {
  const disc =
    size === "sm" ? "h-9 w-9" : size === "lg" ? "h-16 w-16" : "h-12 w-12";
  const icon = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-7 w-7" : "h-5 w-5";
  return (
    <span
      className={clsx("relative inline-grid place-items-center shrink-0", className)}
      aria-hidden
    >
      {/* soft outer ring */}
      <span
        className={clsx(
          "absolute rounded-full",
          size === "lg" ? "h-[86px] w-[86px]" : size === "sm" ? "h-11 w-11" : "h-[62px] w-[62px]",
          live ? "bg-red-500/10" : "bg-accent/10",
        )}
      />
      {live && (
        <span
          className={clsx(
            "absolute rounded-full bg-red-500/30 recording-halo",
            size === "lg" ? "h-16 w-16" : size === "sm" ? "h-9 w-9" : "h-12 w-12",
          )}
        />
      )}
      <span
        className={clsx(
          "relative grid place-items-center rounded-full text-white shadow-sm",
          disc,
          live ? "bg-red-500" : "bg-accent",
        )}
      >
        <Mic className={clsx(icon, "fill-current")} strokeWidth={0} />
      </span>
    </span>
  );
}

export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const box =
    size === "sm" ? "h-6 w-6 text-[11px]" : size === "lg" ? "h-10 w-10 text-base" : "h-7 w-7 text-xs";
  return (
    <div
      className={clsx(
        "rounded-lg bg-chip text-chip-fg grid place-items-center font-bold tracking-tight shrink-0",
        box,
      )}
      aria-hidden
    >
      M
    </div>
  );
}
