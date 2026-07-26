/**
 * Shared Magazyn ↔ Projektowanie visual skin (chrome only).
 * Do not put Magazyn operational content or designer tools here — classNames/tokens only.
 */

/** Soft gray rail fill used by Magazyn side panels. */
export const warehouseRailBgClass = "bg-[#f7f8fa]";

/** Left designer catalog rail — Magazyn spacing + soft fill. */
export const warehouseLeftRailClass = [
  "flex h-full min-h-0 w-[300px] flex-none flex-col self-stretch overflow-hidden overscroll-y-contain",
  "border-r border-slate-200",
  warehouseRailBgClass,
  "px-4 py-4",
].join(" ");

/** Right properties / visual inspector shell override (on AppRightPanel). */
export const warehouseRightRailShellClass = [
  "!bg-[#f7f8fa]",
  "shadow-[-4px_0_24px_rgba(15,23,42,0.04)]",
].join(" ");

/** Section / eyebrow labels (Magazyn rhythm). */
export const warehouseSectionLabelClass =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400";

/** Search / text fields — ring + orange focus (Magazyn). */
export const warehouseSearchInputClass =
  "w-full rounded-xl border-0 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm ring-1 ring-slate-200/80 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400/40";

/** Compact field (selects / short inputs) matching Magazyn ring language. */
export const warehouseFieldClass =
  "w-full rounded-xl border-0 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-sm ring-1 ring-slate-200/80 focus:outline-none focus:ring-2 focus:ring-orange-400/40";

/** Soft white card on gray rail. */
export const warehouseCardClass =
  "rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/60";

/** Catalog / list tile (unselected). */
export const warehouseListTileClass =
  "rounded-xl bg-white px-2.5 py-2 shadow-sm ring-1 ring-slate-200/60 transition-all duration-150 hover:bg-slate-50/90 hover:shadow-md";

/** Catalog / list tile (selected). */
export const warehouseListTileSelectedClass =
  "rounded-xl bg-white px-2.5 py-2 shadow-md ring-2 ring-orange-400/50 transition-all duration-150";

/** @deprecated Prefer {@link WarehouseCardButton} — kept for one-off class composition. */
export const warehousePrimaryActionClass =
  "flex w-full items-center justify-center gap-1.5 rounded-[11px] border border-slate-200/90 bg-white px-3 py-2.5 text-[11px] font-semibold text-slate-800 shadow-sm shadow-slate-900/[0.04] hover:bg-slate-50/90 hover:shadow-md";

/** @deprecated Prefer {@link WarehouseCardButton}. */
export const warehouseSecondaryActionClass =
  "flex w-full items-center justify-center gap-1.5 rounded-[11px] border border-slate-200/90 bg-white px-3 py-2.5 text-[11px] font-medium text-slate-800 shadow-sm shadow-slate-900/[0.04] hover:bg-slate-50/90 hover:shadow-md";


/** Segmented control shell (Katalog | Elementy). */
export const warehouseSegmentShellClass =
  "mb-3 flex shrink-0 rounded-xl bg-white/80 p-0.5 shadow-sm ring-1 ring-slate-200/60";

export const warehouseSegmentBtnClass = (active: boolean) =>
  `flex-1 rounded-lg py-1.5 text-[11px] font-medium transition-colors ${
    active
      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/70"
      : "text-slate-600 hover:text-slate-800"
  }`;

/** Map surround behind white hall (Magazyn framing). */
export const warehouseMapSurroundClass =
  "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-100/80";

/** In-canvas tool group chrome. */
export const warehouseToolGroupClass =
  "flex items-center gap-1 rounded-xl border-0 bg-white/90 p-0.5 shadow-sm ring-1 ring-slate-200/70";
