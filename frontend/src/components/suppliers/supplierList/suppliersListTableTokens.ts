/**
 * Tokeny tabeli listy dostawców — nagłówek z moduleList SSOT.
 */
import {
  listSellasistRowActionBtn,
  listSellasistRowActionBtnDanger,
} from "../../listPage/listSellasistTokens";
import { PROPORTIONAL_TABLE_NO_LOGO } from "../../listPage/proportionalTableColumns";
import {
  moduleListStickyActionsThBase,
  moduleListStickyCheckboxThClass,
  moduleListStickyNameThClass,
  moduleListStickyThClass,
} from "../../listPage/moduleList/moduleListTableTokens";

export const suppliersListTableClass = "w-full table-fixed text-left text-sm";
export const suppliersListThClass = moduleListStickyThClass;
export const suppliersListTdClass = "min-w-0 px-4 py-0 align-middle text-sm leading-snug text-slate-800";
export const suppliersListRowClass =
  "group border-b border-slate-100 transition-colors hover:bg-slate-50/60 last:border-b-0 even:bg-slate-50/20";
export const suppliersListRowInnerClass = "flex min-h-[3.5rem] items-center";

export const suppliersListCheckboxCellClass =
  "sticky left-0 z-[2] box-border w-[56px] min-w-[56px] max-w-[56px] bg-inherit px-0 py-0 align-middle text-center";
export const suppliersListCheckboxInnerClass =
  "flex h-14 min-h-[3.5rem] w-full items-center justify-center";
export const suppliersListCheckboxInputClass =
  "h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-600";
export const suppliersListCheckboxThClass = moduleListStickyCheckboxThClass;

export const suppliersListNameCellClass = "min-w-0 px-4 py-0 align-middle text-sm leading-snug text-slate-800";
export const suppliersListNameThClass = moduleListStickyNameThClass;

/** Trzy przyciski 40×40 w rzędzie. */
export const suppliersListActionsColWidth = "128px";
export const suppliersListActionsCellClass =
  "sticky right-0 z-[2] box-border w-[128px] min-w-[128px] max-w-[128px] shrink-0 bg-inherit px-1 py-0 align-middle";
export const suppliersListActionsThClass = `${moduleListStickyActionsThBase} w-[128px] min-w-[128px] max-w-[128px] text-left`;
export const suppliersListActionsInnerClass =
  "flex min-h-[3.5rem] flex-row flex-nowrap items-center justify-end gap-1";

/** @deprecated Prefer `OperationalActionButton`. */
export const suppliersListRowActionBtn = listSellasistRowActionBtn;
/** @deprecated Prefer `OperationalActionButton variant="accent"`. */
export const suppliersListRowActionBtnAccent = listSellasistRowActionBtn;
/** @deprecated Prefer `OperationalActionButton variant="danger"`. */
export const suppliersListRowActionBtnDanger = listSellasistRowActionBtnDanger;

/** @deprecated Prefer `StatusBadge` from `@/design-system`. */
export const suppliersListBadgeBaseClass =
  "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium";

/** Proporcjonalny układ bez logo; szersza kolumna akcji (3×40px). */
export const SUPPLIERS_LIST_TABLE_LAYOUT = {
  ...PROPORTIONAL_TABLE_NO_LOGO,
  actionsPx: 128,
} as const;
