import { forwardRef } from "react";
import { ChevronLeft, ChevronRight, Pin, PinOff, type LucideIcon } from "lucide-react";

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
  pinned?: boolean;
  focused?: boolean;
  activeRoute?: boolean;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  onActivate: () => void;
  onTogglePin: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
};

const WmsModuleTile = forwardRef<HTMLButtonElement, Props>(function WmsModuleTile(
  {
    moduleId,
    label,
    description,
    icon: Icon,
    metrics,
    pinned = false,
    focused,
    activeRoute,
    canMoveLeft,
    canMoveRight,
    onActivate,
    onTogglePin,
    onMoveLeft,
    onMoveRight,
  },
  ref,
) {
  const accent: WmsModuleAccent = WMS_MODULE_ACCENTS[moduleId];
  const stats = metrics?.stats ?? [];

  return (
    <div
      className={[
        "group relative flex min-h-[9.5rem] w-full flex-col rounded-xl border bg-white",
        "transition-all duration-200 ease-out",
        pinned ? "border-[#5a4fcf]/30 shadow-sm" : "border-slate-200/90 shadow-sm",
        accent.hoverBorder,
        "hover:shadow-md hover:scale-[1.01]",
        focused ? "border-[#5a4fcf]/50 ring-2 ring-[#5a4fcf]/15" : "",
        activeRoute ? "border-[#5a4fcf]/40" : "",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        aria-label={pinned ? `Odepnij ${label} od paska` : `Przypnij ${label} do paska`}
        aria-pressed={pinned}
        className={[
          "absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-200",
          pinned
            ? "border-[#5a4fcf]/25 bg-[#5a4fcf]/10 text-[#5a4fcf] hover:bg-[#5a4fcf]/15"
            : "border-transparent bg-white/80 text-slate-400 opacity-0 hover:border-slate-200 hover:bg-white hover:text-slate-700 group-hover:opacity-100",
          pinned ? "opacity-100" : "",
        ].join(" ")}
      >
        {pinned ? <Pin size={15} strokeWidth={2.25} className="fill-current" /> : <PinOff size={15} strokeWidth={2} />}
      </button>

      <button
        ref={ref}
        type="button"
        onClick={onActivate}
        className="flex min-h-0 flex-1 flex-col p-4 pr-12 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#5a4fcf]/50"
      >
        <div className="mb-3 flex items-start gap-3">
          <div
            className={[
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 transition-transform duration-200 group-hover:scale-105",
              accent.iconBg,
              accent.iconRing,
              accent.iconText,
            ].join(" ")}
          >
            <Icon size={20} strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="truncate text-sm font-bold text-slate-900">{label}</h3>
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-500">{description}</p>
          </div>
        </div>

        {stats.length > 0 ? (
          <div className="mt-auto flex flex-wrap gap-1.5">
            {stats.map((chip) => (
              <span
                key={chip.label}
                className={[
                  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                  STAT_CHIP_CLASS[chip.tone ?? "neutral"],
                ].join(" ")}
              >
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}
      </button>

      {pinned ? (
        <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1">
          <span className="text-[10px] font-medium text-[#5a4fcf]/80">W pasku górnym</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={!canMoveLeft}
              onClick={(e) => {
                e.stopPropagation();
                onMoveLeft?.();
              }}
              aria-label={`Przesuń ${label} w lewo`}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            >
              <ChevronLeft size={16} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              disabled={!canMoveRight}
              onClick={(e) => {
                e.stopPropagation();
                onMoveRight?.();
              }}
              aria-label={`Przesuń ${label} w prawo`}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
            >
              <ChevronRight size={16} strokeWidth={2.25} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});

export default WmsModuleTile;
