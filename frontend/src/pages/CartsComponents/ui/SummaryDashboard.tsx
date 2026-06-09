import { Box } from "lucide-react";

import { AppStatCard } from "../../../components/app-shell/AppStatCard";
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
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <AppStatCard label={t.totalUnits} value={String(summary.totalUnits)} />
        <AppStatCard label={t.inUse} value={String(summary.inUse)} />
        <AppStatCard label={t.available} value={String(summary.available)} />
        <AppStatCard
          label={t.totalVolume}
          value={`${summary.totalVolume.toFixed(1)} dm³`}
          icon={Box}
        />
      </div>
      {typeof summary.totalUsedVolume === "number" ? (
        <div className="space-y-1.5 border-t border-slate-100 pt-3">
          <div className="text-[11px] font-medium text-slate-500">{t.simulation_global_fill}</div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${
                  globalFillPercent >= 96 ? "bg-red-500" : globalFillPercent >= 81 ? "bg-orange-500" : "bg-slate-700"
                }`}
                style={{ width: `${globalFillPercent}%` }}
              />
            </div>
            <span className="text-[11px] font-medium tabular-nums text-slate-600">{globalFillPercent}%</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
