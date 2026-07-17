import { memo, type LucideIcon } from "react";
import { ChevronRight } from "lucide-react";

import type { WmsTabId } from "../wmsTabConfig";
import { resolveWmsModuleAccent } from "./wmsLauncherTypes";
import { WMS_HOME_BORDER } from "./wmsHomeSections";

type Props = {
  moduleId: WmsTabId;
  label: string;
  description?: string;
  icon: LucideIcon;
  count?: number;
  onActivate: () => void;
};

const BADGE_TONE: Partial<Record<WmsTabId, string>> = {
  picking: "bg-blue-500",
  receiving: "bg-emerald-500",
  putaway: "bg-orange-500",
  issues: "bg-red-500",
  packing: "bg-violet-500",
  mm: "bg-sky-500",
};

/** Collector list row ~72px — full-row tap target. */
export const WmsHomeCollectorRow = memo(function WmsHomeCollectorRow({
  moduleId,
  label,
  description,
  icon: Icon,
  count = 0,
  onActivate,
}: Props) {
  const accent = resolveWmsModuleAccent(moduleId);
  const badgeBg = BADGE_TONE[moduleId] ?? "bg-indigo-500";

  return (
    <button
      type="button"
      onClick={onActivate}
      className="flex h-[72px] w-full items-center gap-3 border-b bg-white px-3 text-left active:bg-indigo-50/40"
      style={{ borderColor: WMS_HOME_BORDER }}
    >
      <div
        className={[
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1",
          accent.iconBg,
          accent.iconRing,
          accent.iconText,
        ].join(" ")}
      >
        <Icon size={22} strokeWidth={2.25} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-slate-900">{label}</p>
        {description ? (
          <p className="truncate text-xs text-slate-500">{description}</p>
        ) : null}
      </div>
      {count > 0 ? (
        <span
          className={[
            "inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums text-white",
            badgeBg,
          ].join(" ")}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" strokeWidth={2} aria-hidden />
    </button>
  );
});
