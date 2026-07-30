import type { ReactNode } from "react";

export function OrderDetailSummaryCompactRow({
  label,
  value,
  actions,
}: {
  label: string;
  value: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2.5 text-sm last:border-b-0">
      <span className="shrink-0 text-slate-500 font-medium">{label}</span>
      <div className="flex min-w-0 items-start justify-end gap-1.5 text-right">
        <div className="min-w-0 font-medium leading-snug text-slate-900">{value}</div>
        {actions}
      </div>
    </div>
  );
}
