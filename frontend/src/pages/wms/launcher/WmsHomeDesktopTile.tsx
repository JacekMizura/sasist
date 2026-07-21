import { memo, type LucideIcon } from "react";

import type { WmsTabId } from "../wmsTabConfig";
import { resolveWmsModuleAccent } from "./wmsLauncherTypes";
import { WMS_HOME_BORDER } from "./wmsHomeSections";

type Props = {
  moduleId: WmsTabId;
  label: string;
  description: string;
  icon: LucideIcon;
  count?: number;
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

/**
 * Desktop module card — fully clickable.
 * Content only: icon, name, description, optional badge. No CTA labels / shortcut digits.
 */
export const WmsHomeDesktopTile = memo(function WmsHomeDesktopTile({
  moduleId,
  label,
  description,
  icon: Icon,
  count = 0,
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
        "group flex min-h-[148px] w-full cursor-pointer flex-col rounded-2xl border bg-white p-4 text-left shadow-[0_1px_3px_rgba(15,23,42,0.04)]",
        "transition-[box-shadow,transform,border-color] duration-150 ease-out",
        "hover:-translate-y-[2px] hover:border-[#5a4fcf]/35 hover:shadow-[0_10px_28px_rgba(15,23,42,0.08)]",
        focused ? "border-[#5a4fcf]/40 ring-2 ring-[#5a4fcf]/15" : "",
      ].join(" ")}
      style={{ borderColor: WMS_HOME_BORDER }}
    >
      <div className="flex items-start gap-3.5">
        <div
          className={[
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1",
            accent.iconBg,
            accent.iconRing,
            accent.iconText,
          ].join(" ")}
        >
          <Icon size={28} strokeWidth={2.25} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3
              className="line-clamp-2 text-[17px] font-bold text-slate-900"
              style={{ whiteSpace: "normal", lineHeight: 1.25, wordBreak: "break-word" }}
            >
              {label}
            </h3>
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
          </div>
          <p
            className="mt-1.5 line-clamp-2 text-[13px] text-slate-500"
            style={{ whiteSpace: "normal", lineHeight: 1.35, wordBreak: "break-word" }}
          >
            {description}
          </p>
        </div>
      </div>
      <div className="mt-auto" />
    </button>
  );
});
