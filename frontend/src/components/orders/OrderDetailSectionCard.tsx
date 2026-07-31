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
    ? "rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    : "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
  return (
    <section className={className ?? `${shellClass} flex flex-col h-full`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{title}</h3>
        {right}
      </div>
      <div className={`flex-1 ${contentClassName ?? ""}`}>{children}</div>
    </section>
  );
}
