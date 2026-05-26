import { Pin } from "lucide-react";
import { Link } from "react-router-dom";

import type { WmsTabConfigItem } from "../../pages/wms/wmsTabConfig";

const pinBtnBase =
  "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 active:scale-[0.98] sm:h-16 sm:w-16";

type Props = {
  tab: WmsTabConfigItem;
  pinned: boolean;
  routeActive: boolean;
  onTogglePin: () => void;
};

/**
 * Duży kafel trybu WMS na ekranie menu (terminal / launcher).
 */
export default function WmsModeCard({ tab, pinned, routeActive, onTogglePin }: Props) {
  const Icon = tab.icon;

  return (
    <div
      className={[
        "flex min-h-[6.25rem] items-stretch gap-3 rounded-2xl border bg-white p-3 shadow-sm transition sm:min-h-[6.75rem] sm:gap-4 sm:p-4",
        pinned ? "border-slate-300 ring-1 ring-slate-400/20" : "border-slate-200/90 hover:border-slate-300 hover:shadow-md",
        routeActive ? "ring-2 ring-sky-500/40" : "",
      ].join(" ")}
    >
      <button
        type="button"
        className={[
          pinBtnBase,
          pinned
            ? "border-slate-600 bg-slate-600 text-white hover:bg-slate-700"
            : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800",
        ].join(" ")}
        title={pinned ? "Odepnij z paska" : "Przypnij do paska"}
        aria-pressed={pinned}
        aria-label={pinned ? "Odepnij tryb" : "Przypnij tryb"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onTogglePin();
        }}
      >
        <Pin className={`h-6 w-6 sm:h-7 sm:w-7 ${pinned ? "fill-current" : ""}`} strokeWidth={2.25} aria-hidden />
      </button>

      <Link
        to={tab.path}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-0.5 transition hover:bg-slate-50/90 active:bg-slate-100/80 sm:gap-4"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition group-hover:bg-slate-200/90 sm:h-16 sm:w-16">
          <Icon className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold leading-snug text-slate-900 sm:text-xl">{tab.label}</span>
          <span
            className={[
              "mt-1 inline-block rounded-md px-2 py-0.5 text-[11px] font-black uppercase tracking-wider sm:text-xs",
              pinned ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600",
            ].join(" ")}
          >
            {pinned ? "PRZYPIĘTY" : "NIEPRZYPIĘTY"}
          </span>
        </span>
      </Link>
    </div>
  );
}
