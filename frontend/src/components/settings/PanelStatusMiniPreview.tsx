import type { CSSProperties } from "react";

import { panelSidebarSubCountBadgeClass } from "../../utils/panelSidebarHierarchy";
import { normalizePanelStatusBg, pickReadableTextOnBackground, relativeLuminance } from "../../utils/panelStatusColor";

export type PanelStatusMiniPreviewProps = {
  name: string;
  count?: number;
  badgeHex: string;
  backgroundHex: string;
  textHex: string;
  imageUrl?: string | null;
  /** Etykieta grupy głównej (np. „W toku”) — nad wierszem statusu */
  mainGroupLabel?: string | null;
  /** Nagłówek podgrupy (np. „Zbieranie WMS”) */
  subgroupLabel?: string | null;
  /** Symulacja aktywnego filtra w sidebarze */
  active?: boolean;
  className?: string;
};

/**
 * Podgląd jak w sidebarze: szeroki pasek, tło, ikona, nazwa, licznik (te same reguły kontrastu co panel).
 */
export function PanelStatusMiniPreview({
  name,
  count = 42,
  badgeHex,
  backgroundHex,
  textHex,
  imageUrl,
  mainGroupLabel,
  subgroupLabel,
  active = false,
  className,
}: PanelStatusMiniPreviewProps) {
  const stripe = normalizePanelStatusBg(badgeHex);
  const bg = normalizePanelStatusBg(backgroundHex);
  const rgb = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(bg);
  let backgroundColor: string;
  if (rgb) {
    const r = parseInt(rgb[1], 16);
    const g = parseInt(rgb[2], 16);
    const b = parseInt(rgb[3], 16);
    const a = active ? 0.94 : 0.88;
    backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;
  } else {
    backgroundColor = bg;
  }
  const color = pickReadableTextOnBackground(textHex, bg, 4.2);
  const lumT = relativeLuminance(color);
  const subtleTextShadow = lumT > 0.55 ? "0 1px 2px rgba(0,0,0,0.22)" : "0 1px 0 rgba(255,255,255,0.2)";
  const rowStyle: CSSProperties = {
    backgroundColor,
    borderLeft: `6px solid ${stripe}`,
    color,
    textShadow: subtleTextShadow,
    boxShadow: active
      ? "inset 0 0 0 1px rgba(15,23,42,0.1), 0 2px 6px rgba(15,23,42,0.08)"
      : "inset 0 0 0 1px rgba(15, 23, 42, 0.05), 0 1px 3px rgba(15,23,42,0.06)",
  };
  const showHierarchy = Boolean((mainGroupLabel && mainGroupLabel.trim()) || (subgroupLabel && subgroupLabel.trim()));

  return (
    <div className={className ?? ""}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Podgląd statusu</p>
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2">
        {showHierarchy ? (
          <div className="mb-2 rounded-md border border-slate-300/80 bg-gradient-to-b from-slate-50 to-slate-200/80 px-2.5 py-1.5 shadow-sm ring-1 ring-slate-200/60">
            {mainGroupLabel?.trim() ? (
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-900">{mainGroupLabel.trim()}</div>
            ) : null}
            {subgroupLabel?.trim() ? (
              <div className="mt-0.5 pl-1 text-[12px] font-semibold tracking-normal text-slate-800">{subgroupLabel.trim()}</div>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          className="group flex min-h-[52px] w-full min-w-0 items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-[15px] font-semibold tracking-normal shadow-md transition-[box-shadow,filter] duration-150 hover:shadow-lg"
          style={rowStyle}
        >
          <span className="flex min-w-0 items-center gap-2">
            {imageUrl ? <img src={imageUrl} alt="" className="h-5 w-5 shrink-0 rounded object-contain" /> : null}
            <span className="min-w-0 truncate">{name || "—"}</span>
          </span>
          <span className={panelSidebarSubCountBadgeClass()}>{count}</span>
        </button>
      </div>
    </div>
  );
}
