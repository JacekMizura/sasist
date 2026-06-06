import type { DashboardKpi } from "../../../hooks/operations/useOperationsDashboard";

const TONE_CLASS: Record<DashboardKpi["tone"], string> = {
  red: "border-red-200 bg-red-50",
  amber: "border-amber-200 bg-amber-50",
  green: "border-emerald-200 bg-emerald-50",
  blue: "border-sky-200 bg-sky-50",
};

type Props = { kpis: DashboardKpi[] };

export function OperationsKpiStrip({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {kpis.map((k) => (
        <div
          key={k.id}
          className={`rounded-xl border px-3 py-2.5 shadow-sm ${TONE_CLASS[k.tone]}`}
        >
          <div className="text-lg leading-none">{k.emoji}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{k.value}</div>
          <div className="text-xs font-medium text-slate-600">{k.label}</div>
        </div>
      ))}
    </div>
  );
}
