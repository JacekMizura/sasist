import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
  contentClassName?: string;
  elevated?: boolean;
};

/**
 * Shared order-detail card (summary / aside / bottom sections).
 * Default shell/title classes match the former page-local `SummaryDashboardCard` exactly.
 */
export function OrderDetailSectionCard({
  title,
  children,
  right,
  className,
  contentClassName,
  elevated = false,
}: Props) {
  const shellClass = elevated
    ? "rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    : "rounded-xl border border-slate-200 bg-white p-4";
  return (
    <section className={className ?? shellClass}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>
        {right}
      </div>
      <div className={contentClassName ?? ""}>{children}</div>
    </section>
  );
}
