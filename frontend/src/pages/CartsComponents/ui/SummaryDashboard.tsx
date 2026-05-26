import { CubeIcon } from "./Icons";
import { useTranslation } from "../../../locales";

/** Panel podsumowania: suma jednostek, w użyciu, dostępne, łączna pojemność, globalne zapełnienie. */

type Summary = {
  totalUnits: number;
  inUse: number;
  available: number;
  totalVolume: number;
  totalUsedVolume?: number;
};

type SummaryDashboardProps = {
  summary: Summary;
};

export default function SummaryDashboard({ summary }: SummaryDashboardProps) {
  const t = useTranslation();
  const totalCapacity = summary.totalVolume || 1;
  const globalFillPercent =
    typeof summary.totalUsedVolume === "number"
      ? Math.min(100, Math.round((summary.totalUsedVolume / totalCapacity) * 100))
      : 0;

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-slate-500">{t.totalUnits}</div>
          <div className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{summary.totalUnits}</div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-slate-500">{t.inUse}</div>
          <div className="text-2xl font-semibold tabular-nums tracking-tight text-blue-600">{summary.inUse}</div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-slate-500">{t.available}</div>
          <div className="text-2xl font-semibold tabular-nums tracking-tight text-emerald-600">{summary.available}</div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <CubeIcon className="h-4 w-4 text-slate-300" />
            {t.totalVolume}
          </div>
          <div className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
            {summary.totalVolume.toFixed(1)} <span className="text-sm font-medium text-slate-500">dm³</span>
          </div>
        </div>
      </div>
      {typeof summary.totalUsedVolume === "number" && (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <div className="text-xs font-medium text-slate-500">{t.simulation_global_fill}</div>
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${
                  globalFillPercent >= 96 ? "bg-red-500" : globalFillPercent >= 81 ? "bg-orange-500" : "bg-blue-600"
                }`}
                style={{ width: `${globalFillPercent}%` }}
              />
            </div>
            <span className="text-xs font-medium tabular-nums text-slate-600">{globalFillPercent}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

