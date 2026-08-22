import {
  moduleListStickyActionsThBase,
  moduleListStickyNameThClass,
  moduleListStickyThClass,
  moduleListStickyThRightClass,
} from "../../listPage/moduleList/moduleListTableTokens";

export const carriersListTableClass = "w-full table-fixed text-left text-sm";
export const carriersListThClass = moduleListStickyThClass;
export const carriersListTdClass = "min-w-0 px-4 py-0 align-middle text-sm leading-snug text-slate-800";
export const carriersListRowClass =
  "group cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50/60 last:border-b-0 even:bg-slate-50/20";
export const carriersListRowInnerClass = "flex h-[68px] min-h-[68px] max-h-[68px] items-center";

export const carriersListNameCellClass = "min-w-0 px-4 py-0 align-middle text-sm leading-snug text-slate-800";
export const carriersListNameThClass = moduleListStickyNameThClass;

export const carriersListActionsCellClass =
  "sticky right-0 z-[2] box-border w-[120px] min-w-[120px] max-w-[120px] shrink-0 bg-inherit px-1 py-0 align-middle";
export const carriersListActionsThClass = `${moduleListStickyActionsThBase} w-[120px] min-w-[120px] max-w-[120px]`;
export const carriersListThRightClass = moduleListStickyThRightClass;
