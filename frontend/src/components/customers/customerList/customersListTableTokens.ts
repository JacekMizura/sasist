/**
 * Tokeny tabeli listy klientów — nagłówek z moduleList SSOT; akcje jak Orders/Zwroty.
 */
import {
  listSellasistRowActionBtn,
  listSellasistRowActionBtnDanger,
} from "../../listPage/listSellasistTokens";
import {
  moduleListStickyActionsThBase,
  moduleListStickyCheckboxThClass,
  moduleListStickyThClass,
} from "../../listPage/moduleList/moduleListTableTokens";

export const customersListTableClass = "w-full min-w-[1080px] table-fixed text-left text-sm";
export const customersListThClass = moduleListStickyThClass;
export const customersListTdClass = "px-4 py-0 align-middle text-sm leading-snug text-slate-800";
export const customersListRowClass =
  "group border-b border-slate-100 transition-colors hover:bg-slate-50/60 last:border-b-0 even:bg-slate-50/20";
export const customersListRowInnerClass = "flex min-h-[3.5rem] items-center";

/** Kolumna checkbox — stała szerokość 56 px, identyczna w nagłówku i wierszach. */
export const customersListCheckboxColWidth = "56px";
export const customersListCheckboxCellClass =
  "box-border w-[56px] min-w-[56px] max-w-[56px] px-0 py-0 align-middle text-center";
export const customersListCheckboxInnerClass =
  "flex h-14 min-h-[3.5rem] w-full items-center justify-center";
export const customersListCheckboxInputClass =
  "h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-600";

export const customersListCheckboxThClass = moduleListStickyCheckboxThClass;

/** Dwa przyciski 40×40 — jak Products list (`88px`). */
export const customersListActionsColWidth = "88px";
export const customersListActionsCellClass =
  "box-border w-[88px] min-w-[88px] max-w-[88px] shrink-0 px-1 py-0 align-middle";
export const customersListActionsInnerClass =
  "flex min-h-[3.5rem] flex-row flex-nowrap items-center justify-center gap-1";

export const customersListActionsThClass = `${moduleListStickyActionsThBase} w-[88px] min-w-[88px] max-w-[88px]`;

/** @deprecated Prefer `OperationalActionLink` / `OperationalActionButton`. */
export const customersListRowActionBtn = listSellasistRowActionBtn;
/** @deprecated Prefer `OperationalActionButton variant="danger"`. */
export const customersListRowActionBtnDanger = listSellasistRowActionBtnDanger;

/** Badge typ klienta / VIP — `text-xs font-medium` jak moduleList channel badges. */
export const customersListBadgeBaseClass =
  "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium";
