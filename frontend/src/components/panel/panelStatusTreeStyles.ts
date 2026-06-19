import type { OrderUiMainGroup } from "../../types/orderUiStatus";

/** Plain-text licznik (statusy, grupy, podgrupy) — bez badge. */
export const PANEL_TREE_COUNT_CLASS = "shrink-0 tabular-nums text-xs text-slate-400";

/** Grubszy pasek — wiersz grupy głównej. */
export const PANEL_TREE_GROUP_BAR_CLASS =
  "pointer-events-none absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full";

/** Cieńszy pasek — wiersz statusu. */
export const PANEL_TREE_STATUS_BAR_CLASS =
  "pointer-events-none absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full";

export const PANEL_TREE_GROUP_ROW_CLASS =
  "relative flex min-h-[36px] flex-1 items-center rounded-md py-2 pl-3 pr-1 text-left text-[13px] font-semibold leading-tight text-slate-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

export const PANEL_TREE_GROUP_ROW_ACTIVE_CLASS = "bg-slate-100 text-slate-900";

export const PANEL_TREE_GROUP_ROW_IDLE_CLASS = "text-slate-800 hover:bg-slate-50";

export const PANEL_TREE_GROUP_TOGGLE_CLASS =
  "flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

/** Kontener dzieci grupy — tylko wcięcie i odstępy, bez border-l. */
export const PANEL_TREE_CHILDREN_CLASS = "mt-1 space-y-0.5 pl-4";

export const PANEL_TREE_STATUS_ROW_CLASS =
  "relative flex w-full min-h-[30px] items-center gap-2 rounded-md py-1.5 pl-3 pr-1.5 text-left text-[13px] font-medium leading-tight text-slate-600 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

export const PANEL_TREE_STATUS_ROW_ACTIVE_CLASS = "bg-slate-100 font-semibold text-slate-900";

export const PANEL_TREE_STATUS_ROW_IDLE_CLASS = "hover:bg-slate-50";

/** Nagłówek podgrupy — subtelniejszy niż grupa główna. */
export const PANEL_TREE_SUBGROUP_HEAD_CLASS =
  "flex w-full min-h-[26px] items-center gap-1.5 py-1.5 pl-0.5 pr-0.5 text-left transition-colors hover:bg-slate-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

export const PANEL_TREE_SUBGROUP_TITLE_CLASS =
  "max-w-[46%] shrink-0 truncate text-[11px] font-medium text-slate-400";

export const PANEL_TREE_SUBGROUP_LINE_CLASS = "h-px min-w-[1rem] flex-1 bg-slate-100";

export const PANEL_TREE_SUBGROUP_CHILDREN_CLASS = "space-y-0.5 pl-5";

/** Nagłówek sekcji grupy w pickerze (nieklikalny). */
export const PANEL_TREE_PICKER_GROUP_HEAD_CLASS =
  "relative flex min-h-[32px] items-center py-1.5 pl-3 pr-2 text-[13px] font-semibold leading-tight text-slate-800";

export function panelTreeGroupAccentClass(g: OrderUiMainGroup): string {
  if (g === "NEW") return "bg-blue-500";
  if (g === "IN_PROGRESS") return "bg-amber-500";
  return "bg-emerald-500";
}
