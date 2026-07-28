import type { ReactNode } from "react";

/**
 * Consistent page header — strong title, muted subtitle, optional right-aligned
 * action. Hierarchy from type weight + color, not decoration.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-7">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-bold text-ink tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm text-ink-light mt-1.5 leading-snug max-w-xl">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </div>
  );
}
