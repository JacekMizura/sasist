/** Wspólna tabela list modułu — nagłówek ERP jak Dokumenty / Zakupy (jasnoszare THEAD). */

export const moduleListTableScrollClass = "overflow-x-auto";

export const moduleListTableClass = "w-full min-w-[960px] text-left text-sm whitespace-nowrap";

/** Cały wiersz nagłówka — jasnoszare tło, wyraźna granica z body. */
export const moduleListTheadClass = "border-b border-slate-200 bg-slate-50";

export const moduleListThClass = "px-4 py-3 text-left text-xs font-medium text-slate-400";

export const moduleListThSortClass = `${moduleListThClass} cursor-pointer select-none hover:text-slate-600`;

export const moduleListTdClass = "px-4 py-4 align-top text-sm text-slate-800";

export const moduleListRowClass =
  "group cursor-pointer border-b border-slate-50 transition-colors hover:bg-slate-50/50";

export const moduleListRowSelectedClass = "bg-sky-50/60";

export const moduleListRowActionsRevealClass =
  "opacity-0 transition-opacity group-hover:opacity-100";

export const moduleListEmptyStateClass = "py-12 text-center text-sm text-slate-500";

export const moduleListChannelBadgeClass =
  "inline-flex items-center rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500";

export const moduleListChannelBadgeEmptyClass =
  "inline-flex items-center rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-400";

/** Sticky ERP list headers (Produkty / Klienci / Zestawy / …). */
export const moduleListStickyThInsetShadow = "shadow-[inset_0_-1px_0_0_rgb(226,232,240)]";

export const moduleListStickyThTypography =
  "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

export const moduleListStickyThClass = [
  "sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-4 py-3 text-left",
  moduleListStickyThTypography,
  moduleListStickyThInsetShadow,
].join(" ");

export const moduleListStickyThRightClass = `${moduleListStickyThClass} text-right`;

export const moduleListStickyCheckboxThClass = [
  "sticky left-0 top-0 z-[3] box-border w-[56px] min-w-[56px] max-w-[56px] bg-slate-50 px-0 py-0 align-middle text-center",
  moduleListStickyThInsetShadow,
].join(" ");

export const moduleListStickyPhotoThClass = [
  "sticky top-0 z-10 box-border w-[80px] min-w-[80px] max-w-[80px] shrink-0 bg-slate-50 px-2 py-3 text-center",
  moduleListStickyThTypography,
  moduleListStickyThInsetShadow,
].join(" ");

export const moduleListStickyNameThClass = [
  "sticky top-0 z-10 min-w-0 bg-slate-50 px-4 py-3 text-left",
  moduleListStickyThTypography,
  moduleListStickyThInsetShadow,
].join(" ");

/** Sticky actions column — dodaj szerokość w module (np. w-[88px] min-w-[88px] max-w-[88px]). */
export const moduleListStickyActionsThBase = [
  "sticky right-0 top-0 z-[3] box-border shrink-0 bg-slate-50 px-1 py-3 text-center",
  moduleListStickyThTypography,
  moduleListStickyThInsetShadow,
].join(" ");

export const moduleListSortableThHoverClass =
  "cursor-pointer select-none hover:bg-slate-100/80 transition-colors";
