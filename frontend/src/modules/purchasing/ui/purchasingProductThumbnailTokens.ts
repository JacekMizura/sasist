/** Rozmiary miniaturek produktu w module Zakupy. */
export const PURCHASING_THUMB_TABLE_PX = 40;
export const PURCHASING_THUMB_MD_PX = 56;
export const PURCHASING_THUMB_LG_PX = 80;

export const purchasingThumbBoxClass =
  "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white";

export const purchasingThumbImgClass = "h-full w-full object-contain object-center";

export const purchasingThumbTableSizeClass = "h-10 w-10";
export const purchasingThumbMdSizeClass = "h-14 w-14";
export const purchasingThumbLgSizeClass = "h-20 w-20";

export type PurchasingThumbSize = "table" | "md" | "lg";

export const PURCHASING_THUMB_SIZE_CLASS: Record<PurchasingThumbSize, string> = {
  table: purchasingThumbTableSizeClass,
  md: purchasingThumbMdSizeClass,
  lg: purchasingThumbLgSizeClass,
};

/** Karta podglądu hover — ~240–280 px szerokości. */
export const purchasingHoverPreviewCardClass =
  "pointer-events-none z-[10060] w-[280px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-300/40";

export const purchasingHoverPreviewImageClass =
  "mx-auto flex h-[220px] w-full max-w-[240px] items-center justify-center";
