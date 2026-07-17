import { useMemo } from "react";

import type { WmsHomeKpiCounts } from "./useWmsLauncherBadges";
import { WMS_HOME_BORDER, WMS_HOME_KPI_DEFS } from "./wmsHomeSections";

type Props = {
  kpi: WmsHomeKpiCounts;
  onOpenModule?: (moduleId: string) => void;
};

const TONE_ACCENT: Record<(typeof WMS_HOME_KPI_DEFS)[number]["tone"], string> = {
  blue: "#2563eb",
  green: "#059669",
  orange: "#ea580c",
  red: "#dc2626",
  purple: "#7c3aed",
};

/** KPI informational tiles — large numbers, not form fields. */
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
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-0.5 md:grid md:grid-cols-5 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onOpenModule?.(item.moduleId)}
          className="flex h-[88px] w-[148px] shrink-0 cursor-pointer flex-col justify-center rounded-2xl border bg-white px-4 py-3 text-left shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-[box-shadow,transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-[#5a4fcf]/30 hover:shadow-[0_8px_20px_rgba(15,23,42,0.07)] md:h-[88px] md:w-auto md:min-w-0"
          style={{ borderColor: WMS_HOME_BORDER }}
        >
          <span
            className="text-[2rem] font-bold tabular-nums leading-none tracking-tight"
            style={{ color: TONE_ACCENT[item.tone] }}
          >
            {item.value}
          </span>
          <span className="mt-2 text-[13px] font-semibold leading-tight text-slate-600">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
