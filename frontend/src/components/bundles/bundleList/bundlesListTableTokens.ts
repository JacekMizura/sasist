import {
  moduleListStickyActionsThBase,
  moduleListStickyCheckboxThClass,
  moduleListStickyNameThClass,
  moduleListStickyPhotoThClass,
  moduleListStickyThClass,
  moduleListStickyThRightClass,
} from "../../listPage/moduleList/moduleListTableTokens";

export const bundlesListTableClass = "w-full table-fixed text-left text-sm";
export const bundlesListThClass = moduleListStickyThClass;
export const bundlesListTdClass = "min-w-0 px-4 py-0 align-middle text-sm leading-snug text-slate-800";
export const bundlesListRowClass =
  "group cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50/60 last:border-b-0 even:bg-slate-50/20";
export const bundlesListRowInnerClass = "flex min-h-[5rem] items-center";

export const bundlesListCheckboxCellClass =
  "sticky left-0 z-[2] box-border w-[56px] min-w-[56px] max-w-[56px] bg-inherit px-0 py-0 align-middle text-center";
export const bundlesListCheckboxInnerClass = "flex h-20 min-h-[5rem] w-full items-center justify-center";
export const bundlesListCheckboxInputClass = "h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-600";
export const bundlesListCheckboxThClass = moduleListStickyCheckboxThClass;

export const bundlesListPhotoCellClass =
  "box-border w-[80px] min-w-[80px] max-w-[80px] shrink-0 px-2 py-0 align-middle text-center";
export const bundlesListPhotoThClass = moduleListStickyPhotoThClass;

export const bundlesListNameCellClass = "min-w-0 px-4 py-0 align-middle text-sm leading-snug text-slate-800";
export const bundlesListNameThClass = moduleListStickyNameThClass;

export const bundlesListActionsCellClass =
  "sticky right-0 z-[2] box-border w-[120px] min-w-[120px] max-w-[120px] shrink-0 bg-inherit px-1 py-0 align-middle";
export const bundlesListActionsThClass = `${moduleListStickyActionsThBase} w-[120px] min-w-[120px] max-w-[120px]`;
export const bundlesListActionsInnerClass =
  "flex min-h-[5rem] flex-row flex-nowrap items-center justify-center gap-1";

export const bundlesListThRightClass = moduleListStickyThRightClass;
