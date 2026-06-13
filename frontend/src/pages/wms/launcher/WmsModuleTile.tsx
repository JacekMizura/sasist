import { forwardRef, memo, type HTMLAttributes } from "react";
import { ChevronLeft, ChevronRight, GripVertical, Pin, PinOff, type LucideIcon } from "lucide-react";

import type { WmsTabId } from "../wmsTabConfig";
import {
  STAT_CHIP_CLASS,
  resolveWmsModuleAccent,
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
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  onActivate: () => void;
  onTogglePin: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
};

const WmsModuleTile = memo(
  forwardRef<HTMLButtonElement, Props>(function WmsModuleTile(
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
      dragHandleProps,
      onActivate,
      onTogglePin,
      onMoveLeft,
      onMoveRight,
    },
    ref,
  ) {
    const accent = resolveWmsModuleAccent(moduleId);
    const stats = metrics?.stats ?? [];

    return (
      <div
        className={[
          "group relative flex min-h-[11rem] w-full flex-col rounded-xl border bg-white shadow-sm",
          "transition-[box-shadow,border-color,transform] duration-200 ease-out",
          pinned ? "border-[#5a4fcf]/20" : "border-slate-200/90",
          accent.hoverBorder,
          "hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)]",
          focused ? "border-[#5a4fcf]/35 ring-2 ring-[#5a4fcf]/12" : "",
          activeRoute ? "border-[#5a4fcf]/30" : "",
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
            "absolute right-2.5 top-2.5 z-10 flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200",
            pinned
              ? "border-[#5a4fcf]/20 bg-[#5a4fcf]/8 text-[#5a4fcf] hover:bg-[#5a4fcf]/12"
              : "border-transparent bg-white/90 text-slate-400 opacity-0 hover:border-slate-200 hover:text-slate-600 group-hover:opacity-100",
            pinned ? "opacity-100" : "",
          ].join(" ")}
        >
          {pinned ? <Pin size={16} strokeWidth={2.25} className="fill-current" /> : <PinOff size={16} strokeWidth={2} />}
        </button>

        <button
          ref={ref}
          type="button"
          onClick={onActivate}
          className="flex min-h-0 flex-1 flex-col p-5 pr-12 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#5a4fcf]/40"
        >
          <div className="mb-3 flex items-start gap-4">
            <div
              className={[
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1",
                accent.iconBg,
                accent.iconRing,
                accent.iconText,
              ].join(" ")}
            >
              <Icon size={24} strokeWidth={2.25} aria-hidden />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h3 className="truncate text-base font-bold text-slate-900 lg:text-lg">{label}</h3>
              <p className="mt-1 line-clamp-2 text-sm leading-snug text-slate-500">{description}</p>
            </div>
          </div>

          {stats.length > 0 ? (
            <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
              {stats.map((chip) => (
                <span
                  key={chip.label}
                  className={[
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-tight tabular-nums",
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
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#5a4fcf]/70">Przypięty</span>
            <div className="flex items-center gap-0.5">
              {dragHandleProps ? (
                <button
                  type="button"
                  className="inline-flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 active:cursor-grabbing"
                  aria-label={`Przeciągnij ${label}`}
                  {...dragHandleProps}
                >
                  <GripVertical size={16} strokeWidth={2} aria-hidden />
                </button>
              ) : null}
              <div className="hidden items-center md:flex">
                <button
                  type="button"
                  disabled={!canMoveLeft}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveLeft?.();
                  }}
                  aria-label={`Przesuń ${label} w lewo`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:opacity-30"
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
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:opacity-30"
                >
                  <ChevronRight size={16} strokeWidth={2.25} />
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }),
);

export default WmsModuleTile;
