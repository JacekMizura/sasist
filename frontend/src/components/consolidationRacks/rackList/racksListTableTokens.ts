import {
  moduleListStickyActionsThBase,
  moduleListStickyNameThClass,
  moduleListStickyThClass,
  moduleListStickyThRightClass,
} from "../../listPage/moduleList/moduleListTableTokens";

export const racksListTableClass = "w-full table-fixed text-left text-sm";
export const racksListThClass = moduleListStickyThClass;
export const racksListTdClass = "min-w-0 px-4 py-0 align-middle text-sm leading-snug text-slate-800";
export const racksListRowClass =
  "group border-b border-slate-100 transition-colors hover:bg-slate-50/60 last:border-b-0 even:bg-slate-50/20";
export const racksListRowInnerClass = "flex h-[68px] min-h-[68px] max-h-[68px] items-center";

export const racksListNameCellClass = "min-w-0 px-4 py-0 align-middle text-sm leading-snug text-slate-800";
export const racksListNameThClass = moduleListStickyNameThClass;

export const racksListActionsCellClass =
  "sticky right-0 z-[2] box-border w-[120px] min-w-[120px] max-w-[120px] shrink-0 bg-inherit px-1 py-0 align-middle";
export const racksListActionsThClass = `${moduleListStickyActionsThBase} w-[120px] min-w-[120px] max-w-[120px]`;
export const racksListThRightClass = moduleListStickyThRightClass;
