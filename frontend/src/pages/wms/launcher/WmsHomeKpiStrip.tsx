import { useMemo } from "react";

import type { WmsHomeKpiCounts } from "./useWmsLauncherBadges";
import { WMS_HOME_BORDER, WMS_HOME_KPI_DEFS } from "./wmsHomeSections";

type Props = {
  kpi: WmsHomeKpiCounts;
  onOpenModule?: (moduleId: string) => void;
};

/** Compact KPI cards — number on top, label below. Not input-like. */
export function WmsHomeKpiStrip({ kpi, onOpenModule }: Props) {
  const items = useMemo(
    () =>
      WMS_HOME_KPI_DEFS.map((def) => ({
        ...def,
        value: kpi[def.key] ?? 0,
      })),
    [kpi],
  );

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 md:grid md:grid-cols-5 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onOpenModule?.(item.moduleId)}
          className="flex h-[76px] w-[132px] shrink-0 flex-col justify-center rounded-xl border bg-white px-3 py-2 text-left transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(15,23,42,0.06)] md:h-[76px] md:w-auto md:min-w-0"
          style={{ borderColor: WMS_HOME_BORDER }}
        >
          <span className="text-2xl font-bold tabular-nums leading-none text-slate-900">{item.value}</span>
          <span className="mt-1.5 text-[12px] font-medium leading-tight text-slate-500">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
