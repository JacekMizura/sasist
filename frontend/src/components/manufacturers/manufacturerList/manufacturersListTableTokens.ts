/**
 * Tokeny tabeli listy producentów — nagłówki jak Products/Klienci; akcje przez `OperationalActionButton`.
 */
import {
  listSellasistRowActionBtn,
  listSellasistRowActionBtnDanger,
} from "../../listPage/listSellasistTokens";

export const manufacturersListTableClass = "w-full table-fixed text-left text-sm";
export const manufacturersListThClass =
  "sticky top-0 z-10 whitespace-nowrap bg-white px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]";
export const manufacturersListTdClass = "px-4 py-0 align-middle text-sm leading-snug text-slate-800";
export const manufacturersListRowClass =
  "group border-b border-slate-100 transition-colors hover:bg-slate-50/60 last:border-b-0 even:bg-slate-50/20";
export const manufacturersListRowInnerClass = "flex min-h-[3.5rem] items-center";

/** Kolumna checkbox — stała 56 px, sticky lewa. */
export const manufacturersListCheckboxColWidth = "56px";
export const manufacturersListCheckboxCellClass =
  "sticky left-0 z-[2] box-border w-[56px] min-w-[56px] max-w-[56px] bg-inherit px-0 py-0 align-middle text-center";
export const manufacturersListCheckboxInnerClass =
  "flex h-14 min-h-[3.5rem] w-full items-center justify-center";
export const manufacturersListCheckboxInputClass =
  "h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-600";
export const manufacturersListCheckboxThClass =
  "sticky left-0 top-0 z-[3] box-border w-[56px] min-w-[56px] max-w-[56px] bg-white px-0 py-0 align-middle text-center shadow-[inset_0_-1px_0_0_rgb(226,232,240)]";

/** Kolumna logo — stała szerokość 80 px. */
export const manufacturersListLogoColWidth = "80px";
export const manufacturersListLogoCellClass =
  "box-border w-[80px] min-w-[80px] max-w-[80px] px-2 py-0 align-middle text-center";
export const manufacturersListLogoThClass =
  "sticky top-0 z-10 box-border w-[80px] min-w-[80px] max-w-[80px] bg-white px-2 py-0 align-middle text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]";

export const manufacturersListNameCellClass = "min-w-0 px-4 py-0 align-middle text-sm leading-snug text-slate-800";
export const manufacturersListNameThClass =
  "sticky top-0 z-10 min-w-0 bg-white px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]";

/** Dwa przyciski 40×40 — jak Products/Klienci (`88px`). */
export const manufacturersListActionsColWidth = "88px";
export const manufacturersListActionsCellClass =
  "sticky right-0 z-[2] box-border w-[88px] min-w-[88px] max-w-[88px] shrink-0 bg-inherit px-1 py-0 align-middle";
export const manufacturersListActionsThClass =
  "sticky right-0 top-0 z-[3] box-border w-[88px] min-w-[88px] max-w-[88px] shrink-0 bg-white px-1 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]";
export const manufacturersListActionsInnerClass =
  "flex min-h-[3.5rem] flex-row flex-nowrap items-center justify-center gap-1";

/** @deprecated Prefer `OperationalActionButton`. */
export const manufacturersListRowActionBtn = listSellasistRowActionBtn;
/** @deprecated Prefer `OperationalActionButton variant="danger"`. */
export const manufacturersListRowActionBtnDanger = listSellasistRowActionBtnDanger;

/** Stały obszar logo 40×40 px — wyrównanie wizualne wierszy. */
export const manufacturersListLogoBoxClass =
  "flex h-10 w-10 shrink-0 items-center justify-center";

/** Badge status / etykiety — `text-xs font-medium` jak Klienci. */
export const manufacturersListBadgeBaseClass =
  "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium";

/** Proporcjonalny układ — węższa kolumna akcji (2×40px). */
export const MANUFACTURERS_LIST_TABLE_LAYOUT = { actionsPx: 88 } as const;
