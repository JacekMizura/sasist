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
    ? "rounded-md border border-slate-200/70 bg-white p-3 shadow-sm"
    : "rounded-md border border-slate-200/70 bg-white p-3";
  return (
    <section className={className ?? shellClass}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</h3>
        {right}
      </div>
      <div className={contentClassName ?? ""}>{children}</div>
    </section>
  );
}
