import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ClipboardList,
  Inbox,
  Package,
  Warehouse,
} from "lucide-react";

import type { WmsHomeKpiCounts } from "./useWmsLauncherBadges";
import { WMS_HOME_BORDER, WMS_HOME_KPI_DEFS, type WmsHomeKpiKey } from "./wmsHomeSections";

const KPI_ICON: Record<WmsHomeKpiKey, LucideIcon> = {
  picking: ClipboardList,
  receiving: Inbox,
  putaway: Warehouse,
  issues: AlertTriangle,
  packing: Package,
};

const KPI_TONE_CLASS: Record<(typeof WMS_HOME_KPI_DEFS)[number]["tone"], string> = {
  blue: "text-blue-600 ring-blue-100 bg-blue-50",
  green: "text-emerald-600 ring-emerald-100 bg-emerald-50",
  orange: "text-orange-600 ring-orange-100 bg-orange-50",
  red: "text-red-600 ring-red-100 bg-red-50",
  purple: "text-violet-600 ring-violet-100 bg-violet-50",
};

type Props = {
  kpi: WmsHomeKpiCounts;
  onOpenModule?: (moduleId: string) => void;
};

export function WmsHomeKpiStrip({ kpi, onOpenModule }: Props) {
  const items = useMemo(
    () =>
      WMS_HOME_KPI_DEFS.map((def) => ({
        ...def,
        value: kpi[def.key] ?? 0,
        Icon: KPI_ICON[def.key],
      })),
    [kpi],
  );

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onOpenModule?.(item.moduleId)}
          className="flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-left transition-shadow hover:shadow-[0_4px_14px_rgba(15,23,42,0.06)]"
          style={{ borderColor: WMS_HOME_BORDER }}
        >
          <span
            className={[
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1",
              KPI_TONE_CLASS[item.tone],
            ].join(" ")}
          >
            <item.Icon size={18} strokeWidth={2.25} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-bold tabular-nums leading-none text-slate-900">
              {item.value}
            </span>
            <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">
              {item.label}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
