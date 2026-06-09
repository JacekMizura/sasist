import { forwardRef } from "react";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import type { WmsTabId } from "../wmsTabConfig";
import {
  STAT_CHIP_CLASS,
  WMS_MODULE_ACCENTS,
  type WmsModuleAccent,
  type WmsModuleTileMetrics,
} from "./wmsLauncherTypes";

type Props = {
  moduleId: WmsTabId;
  label: string;
  description: string;
  icon: LucideIcon;
  metrics?: WmsModuleTileMetrics;
  focused?: boolean;
  activeRoute?: boolean;
  onActivate: () => void;
};

const WmsModuleTile = forwardRef<HTMLButtonElement, Props>(function WmsModuleTile(
  { moduleId, label, description, icon: Icon, metrics, focused, activeRoute, onActivate },
  ref,
) {
  const accent: WmsModuleAccent = WMS_MODULE_ACCENTS[moduleId];
  const stats = metrics?.stats ?? [];

  return (
    <button
      ref={ref}
      type="button"
      onClick={onActivate}
      aria-label={stats.length ? `${label}. ${stats.map((s) => s.label).join(", ")}` : label}
      className={[
        "group relative flex min-h-[11.5rem] w-full flex-col rounded-2xl border border-slate-200/90 bg-white p-6 text-left shadow-sm",
        "transition-all duration-200 ease-out",
        accent.hoverBorder,
        accent.hoverShadow,
        "hover:-translate-y-0.5 hover:shadow-lg",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
        focused ? "border-indigo-300 shadow-md ring-2 ring-indigo-500/20" : "",
        activeRoute ? "border-indigo-200 bg-indigo-50/20" : "",
      ].join(" ")}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div
          className={[
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform duration-200 group-hover:scale-105",
            accent.iconBg,
            accent.iconRing,
            accent.iconText,
          ].join(" ")}
        >
          <Icon size={24} strokeWidth={2} aria-hidden />
        </div>
        <ArrowUpRight
          size={18}
          strokeWidth={2}
          className="shrink-0 text-slate-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-500"
          aria-hidden
        />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-bold tracking-tight text-slate-900">{label}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-500">{description}</p>
      </div>

      <div className="mt-5 flex min-h-[1.75rem] flex-wrap items-center gap-2">
        {stats.length > 0 ? (
          stats.map((chip) => (
            <span
              key={chip.label}
              className={[
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums",
                STAT_CHIP_CLASS[chip.tone ?? "neutral"],
              ].join(" ")}
            >
              {chip.label}
            </span>
          ))
        ) : (
          <span className="text-[11px] font-medium text-slate-400">Brak aktywnych zadań</span>
        )}
      </div>
    </button>
  );
});

export default WmsModuleTile;
