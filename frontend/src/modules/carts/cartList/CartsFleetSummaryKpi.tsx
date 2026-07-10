import { Box, CheckCircle2, Layers, Package } from "lucide-react";

import { useTranslation } from "../../../locales";
import { PurchasingKpiCard, PurchasingKpiGrid } from "../../purchasing/ui";
import { type CartsFleetSummary, globalFleetFillPercent } from "./cartsFleetSummary";

type Props = {
  summary: CartsFleetSummary;
};

/** KPI + globalne zapełnienie floty wózków (wzorzec Pulpit zakupów). */
export function CartsFleetSummaryKpi({ summary }: Props) {
  const t = useTranslation();
  const globalFillPercent = globalFleetFillPercent(summary);
  const barTone =
    globalFillPercent >= 96 ? "bg-red-500" : globalFillPercent >= 81 ? "bg-amber-500" : "bg-emerald-600";

  return (
    <div className="space-y-3">
      <PurchasingKpiGrid columns={4}>
        <PurchasingKpiCard title={t.totalUnits} value={summary.totalUnits} tone="indigo" icon={<Layers aria-hidden />} />
        <PurchasingKpiCard title={t.inUse} value={summary.inUse} tone="amber" icon={<Package aria-hidden />} />
        <PurchasingKpiCard
          title={t.available}
          value={summary.available}
          tone="emerald"
          icon={<CheckCircle2 aria-hidden />}
        />
        <PurchasingKpiCard
          title={t.totalVolume}
          value={`${summary.totalVolume.toFixed(1)} dm³`}
          tone="blue"
          icon={<Box aria-hidden />}
        />
      </PurchasingKpiGrid>

      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-slate-600">{t.simulation_global_fill}</span>
          <span className="text-sm font-semibold tabular-nums text-slate-900">{globalFillPercent}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barTone}`}
            style={{ width: `${globalFillPercent}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {summary.totalUsedVolume.toFixed(1)} / {summary.totalVolume.toFixed(1)} dm³
        </p>
      </div>
    </div>
  );
}
