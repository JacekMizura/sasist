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
 * Zaktualizowany widok podglądu: nowoczesny design z "żywym" wskaźnikiem
 * i czytelną hierarchią.
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
  const rgb = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(bg);
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
    color,
    textShadow: subtleTextShadow,
    boxShadow: active
      ? "inset 0 0 0 1px rgba(15,23,42,0.1), 0 2px 6px rgba(15,23,42,0.08)"
      : "inset 0 0 0 1px rgba(15, 23, 42, 0.05), 0 1px 3px rgba(15,23,42,0.06)",
  };

  const showHierarchy = Boolean((mainGroupLabel && mainGroupLabel.trim()) || (subgroupLabel && subgroupLabel.trim()));

  return (
    <div className={className ?? ""}>
      <label className="mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
        Podgląd na żywo
      </label>

      {/* Kontener z nowoczesnym tłem w kropki */}
      <div className="rounded-xl border border-slate-200/60 bg-slate-100/50 p-6 flex flex-col items-center justify-center bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9IiNlMmU4ZjAiLz48L3N2Zz4=')]">
        
        {/* Hierarchia */}
        {showHierarchy ? (
          <div className="w-full max-w-sm mb-3">
            {mainGroupLabel?.trim() ? (
              <div className="flex items-center gap-2 mb-1.5 text-slate-800 font-semibold tracking-tight">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="6 9 12 15 18 9"></polyline></svg>
                {mainGroupLabel.trim()}
              </div>
            ) : null}
            {subgroupLabel?.trim() ? (
              <div className="flex items-center gap-2 w-full pt-1 pb-1 opacity-70 pl-6">
                <div className="h-px bg-slate-300 flex-1"></div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {subgroupLabel.trim().replace(/[-]/g, '')}
                </span>
                <div className="h-px bg-slate-300 flex-1"></div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Status */}
        <button
          type="button"
          className="group flex min-h-[48px] w-full max-w-sm items-center justify-between p-2.5 rounded-md relative overflow-hidden transition-all ring-1 ring-slate-200/50 hover:scale-[1.01] hover:shadow-md"
          style={rowStyle}
        >
          <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: stripe }}></div>
          <span className="flex min-w-0 items-center gap-2 pl-2">
            {imageUrl ? <img src={imageUrl} alt="" className="h-5 w-5 shrink-0 rounded object-contain" /> : null}
            <span className="min-w-0 truncate text-[14px] font-medium tracking-normal">{name || "—"}</span>
          </span>
          <span className={panelSidebarSubCountBadgeClass()}>{count}</span>
        </button>
      </div>
    </div>
  );
}