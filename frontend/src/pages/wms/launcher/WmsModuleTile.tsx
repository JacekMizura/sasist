import { forwardRef } from "react";
import type { LucideIcon } from "lucide-react";

import type { WmsModuleBadge } from "./wmsLauncherTypes";

const BADGE_CLASS: Record<WmsModuleBadge["tone"], string> = {
  neutral: "bg-slate-700 text-white",
  active: "bg-[#1e4d8c] text-white",
  warning: "bg-amber-500 text-[#1a1200]",
  critical: "bg-red-600 text-white",
};

type Props = {
  label: string;
  icon: LucideIcon;
  badge?: WmsModuleBadge;
  focused?: boolean;
  activeRoute?: boolean;
  onActivate: () => void;
};

const WmsModuleTile = forwardRef<HTMLButtonElement, Props>(function WmsModuleTile(
  { label, icon: Icon, badge, focused, activeRoute, onActivate },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onActivate}
      aria-label={badge ? `${label}, ${badge.label} zadań` : label}
      className={[
        "relative flex min-h-[8.75rem] w-full flex-col justify-between border-2 p-3 text-left sm:min-h-[9.5rem] sm:p-4",
        "border-slate-300 bg-white text-slate-900",
        "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-0 focus-visible:outline-orange-500",
        focused ? "border-[#1e4d8c] bg-blue-50/40 ring-2 ring-orange-500 ring-offset-2 ring-offset-slate-100" : "",
        activeRoute ? "border-[#1e4d8c]" : "",
        "active:bg-slate-100",
      ].join(" ")}
    >
      {badge ? (
        <span
          className={[
            "absolute right-2 top-2 min-w-[2rem] px-2 py-0.5 text-center text-sm font-black tabular-nums sm:right-3 sm:top-3 sm:text-base",
            BADGE_CLASS[badge.tone],
          ].join(" ")}
        >
          {badge.label}
        </span>
      ) : null}

      <div className="flex h-14 w-14 items-center justify-center border-2 border-slate-200 bg-slate-50 text-[#1e3a5f] sm:h-16 sm:w-16">
        <Icon size={34} strokeWidth={2.25} aria-hidden />
      </div>

      <p className="mt-3 pr-8 text-base font-black leading-snug text-slate-900 sm:text-lg">{label}</p>
    </button>
  );
});

export default WmsModuleTile;
