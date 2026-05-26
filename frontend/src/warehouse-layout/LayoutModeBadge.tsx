/**
 * Persistent floating badge showing current layout mode (top-right of canvas).
 */
import type { LayoutMode } from "./LayoutMode";
import { LAYOUT_MODE_SHORTCUTS } from "./LayoutMode";

export type LayoutModeBadgeProps = {
  modeLabel: string;
  /** Accent for the mode indicator (left stripe + focus ring). */
  modeColor: string;
  /** When set, shows shortcut hint and maps cursor affordance in aria. */
  layoutMode?: LayoutMode | null;
  className?: string;
};

function ModeIcon({ mode }: { mode: LayoutMode | null | undefined }) {
  if (mode == null) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500" aria-hidden>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
      </span>
    );
  }
  if (mode === "SELECT") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600" aria-hidden>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M5 3l3.5 14L10 13l4 8 1-5.5L21 12 5 3z" />
        </svg>
      </span>
    );
  }
  if (mode === "DRAW_ROW" || mode === "DRAW_AISLE") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600" aria-hidden>
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600" aria-hidden>
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
    </span>
  );
}

export function LayoutModeBadge({ modeLabel, modeColor, layoutMode, className = "" }: LayoutModeBadgeProps) {
  const shortcut = layoutMode != null ? LAYOUT_MODE_SHORTCUTS[layoutMode] : null;
  return (
    <div
      className={`absolute right-4 top-4 z-20 flex max-w-[min(100%,18rem)] items-stretch gap-0 overflow-hidden rounded-full border border-slate-200/90 bg-white/95 pl-0 pr-3 shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/[0.04] backdrop-blur-sm transition-[box-shadow,transform,border-color] duration-150 ease-out hover:shadow-xl hover:shadow-slate-900/12 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={`Tryb edytora: ${modeLabel}`}
    >
      <span className="w-1 shrink-0 self-stretch rounded-l-full" style={{ backgroundColor: modeColor }} aria-hidden />
      <div className="flex min-w-0 items-center gap-2 py-1.5 pl-2">
        <ModeIcon mode={layoutMode} />
        <div className="min-w-0 leading-tight">
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Tryb</div>
          <div className="truncate text-sm font-semibold tracking-tight text-slate-900">{modeLabel}</div>
        </div>
        {shortcut != null ? (
          <kbd className="ml-1 hidden shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 sm:inline-block" title="Skrót klawiszowy">
            {shortcut}
          </kbd>
        ) : null}
      </div>
    </div>
  );
}
