import { memo, type LucideIcon } from "react";

import type { WmsTabId } from "../wmsTabConfig";
import { resolveWmsModuleAccent } from "./wmsLauncherTypes";
import { WMS_HOME_BORDER, WMS_HOME_PRIMARY } from "./wmsHomeSections";

type Props = {
  moduleId: WmsTabId;
  label: string;
  description: string;
  icon: LucideIcon;
  count?: number;
  shortcut?: number | string;
  focused?: boolean;
  onActivate: () => void;
};

const BADGE_TONE: Partial<Record<WmsTabId, string>> = {
  picking: "bg-blue-500",
  receiving: "bg-emerald-500",
  putaway: "bg-orange-500",
  issues: "bg-red-500",
  packing: "bg-violet-500",
  mm: "bg-sky-500",
  consolidations: "bg-violet-500",
  inventory_count: "bg-blue-500",
};

/** Desktop home tile — compact, max-width 280, min-height 120. */
export const WmsHomeDesktopTile = memo(function WmsHomeDesktopTile({
  moduleId,
  label,
  description,
  icon: Icon,
  count = 0,
  shortcut,
  focused,
  onActivate,
}: Props) {
  const accent = resolveWmsModuleAccent(moduleId);
  const badgeBg = BADGE_TONE[moduleId] ?? "bg-indigo-500";

  return (
    <button
      type="button"
      onClick={onActivate}
      className={[
        "group flex min-h-[120px] w-full flex-col rounded-xl border bg-white p-3 text-left",
        "transition-[box-shadow,transform] duration-150 ease-out",
        "hover:-translate-y-[2px] hover:shadow-[0_8px_20px_rgba(15,23,42,0.07)]",
        focused ? "ring-2 ring-[#5a4fcf]/20" : "",
      ].join(" ")}
      style={{ borderColor: WMS_HOME_BORDER }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={[
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1",
            accent.iconBg,
            accent.iconRing,
            accent.iconText,
          ].join(" ")}
        >
          <Icon size={20} strokeWidth={2.25} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3
              className="line-clamp-2 text-[14px] font-bold text-slate-900"
              style={{ whiteSpace: "normal", lineHeight: 1.2, wordBreak: "break-word" }}
            >
              {label}
            </h3>
            {count > 0 ? (
              <span
                className={[
                  "inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums text-white",
                  badgeBg,
                ].join(" ")}
              >
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500">{description}</p>
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between pt-2">
        <span className="text-[11px] font-medium tabular-nums text-slate-400">
          {shortcut != null ? String(shortcut) : ""}
        </span>
        <span
          className="text-[11px] font-bold uppercase tracking-wide"
          style={{ color: WMS_HOME_PRIMARY }}
        >
          Otwórz →
        </span>
      </div>
    </button>
  );
});
