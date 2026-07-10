import type { ReactNode } from "react";
import { dashboardCardPadding } from "../../components/dashboard/dashboardDensityPrimitives";

/** KPI strip — same rhythm as {@link ../CartsComponents/ui/SummaryDashboard}. */
export function DocumentsKpiRow({
  items,
}: {
  items: { label: string; value: string | number; tone?: "slate" | "blue" | "emerald" | "amber" }[];
}) {
  const toneValue: Record<string, string> = {
    slate: "text-slate-900",
    blue: "text-blue-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
  };
  return (
    <div className={`border-b border-slate-100 bg-slate-50/50 ${dashboardCardPadding}`}>
      <div className={`grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4`}>
        {items.map((it) => (
          <div key={it.label} className="flex flex-col gap-0.5">
            <div className="text-xs font-medium text-slate-500">{it.label}</div>
            <div className={`text-xl font-semibold tabular-nums tracking-tight ${toneValue[it.tone ?? "slate"]}`}>
              {it.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Toolbar row — search + filters (Wózki-style density). */
export function DocumentsFiltersToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
      {children}
    </div>
  );
}

export const documentsFilterInputCls =
  "min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-500/30";

/** Sticky table header — scroll parent should be the table card or outlet pane. */
export const documentsTableTheadCls =
  "sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur-[2px]";

export const documentsTableSelectCls =
  "min-h-[40px] min-w-[8.5rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30";

/** Rounded table surface + optional sticky header (matches cart list tables). */
export function DocumentsTableCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ${className}`.trim()}
    >
      {children}
    </div>
  );
}
