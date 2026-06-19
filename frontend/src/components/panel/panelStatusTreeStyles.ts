import type { OrderUiMainGroup } from "../../types/orderUiStatus";

/** Plain-text licznik — bez badge. */
export const PANEL_TREE_COUNT_CLASS = "shrink-0 tabular-nums text-xs font-medium text-slate-500";

/** Grubszy pasek — wiersz grupy głównej. */
export const PANEL_TREE_GROUP_BAR_CLASS =
  "pointer-events-none absolute left-0 top-2 bottom-2 w-1 rounded-full";

/** Cieńszy pasek — wiersz statusu. */
export const PANEL_TREE_STATUS_BAR_CLASS =
  "pointer-events-none absolute left-0 top-2 bottom-2 w-[3px] rounded-full transition-opacity";

export const PANEL_TREE_GROUP_ROW_CLASS =
  "group relative flex min-h-[42px] flex-1 items-center gap-2 rounded-lg border border-transparent py-2.5 pl-3 pr-2 text-left text-[13px] font-semibold leading-snug text-slate-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

export const PANEL_TREE_GROUP_ROW_ACTIVE_CLASS = "border-slate-200 bg-slate-50 text-slate-900";

export const PANEL_TREE_GROUP_ROW_IDLE_CLASS = "hover:bg-slate-50";

export const PANEL_TREE_GROUP_SHELL_ACTIVE_CLASS = "rounded-lg border border-slate-200 bg-slate-50";

export const PANEL_TREE_GROUP_TOGGLE_CLASS =
  "flex shrink-0 items-center justify-center rounded-lg border border-transparent px-2 py-2.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

/** Kontener dzieci grupy — wcięcie i odstępy, bez border-l. */
export const PANEL_TREE_CHILDREN_CLASS = "mt-2.5 space-y-1 pl-4";

export const PANEL_TREE_STATUS_ROW_CLASS =
  "group relative flex w-full min-h-[36px] items-center gap-2 rounded-lg border border-transparent py-2 pl-3 pr-2.5 text-left text-[13px] leading-snug text-slate-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

export const PANEL_TREE_STATUS_ROW_ACTIVE_CLASS = "border-slate-200 bg-slate-50 font-medium text-slate-900";

export const PANEL_TREE_STATUS_ROW_IDLE_CLASS = "font-normal hover:bg-slate-50";

export const PANEL_TREE_STATUS_BAR_IDLE_CLASS = "opacity-60 group-hover:opacity-100";

export const PANEL_TREE_STATUS_BAR_ACTIVE_CLASS = "opacity-100";

/** Nagłówek podgrupy — subtelna sekcja. */
export const PANEL_TREE_SUBGROUP_HEAD_CLASS =
  "mt-2.5 flex w-full min-h-[28px] items-center gap-1.5 py-1 pl-0.5 pr-0.5 text-left transition-colors hover:bg-slate-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 first:mt-1.5";

export const PANEL_TREE_SUBGROUP_TITLE_CLASS = "max-w-[52%] shrink-0 truncate text-xs font-medium text-slate-400";

export const PANEL_TREE_SUBGROUP_LINE_CLASS = "h-px min-w-[1.5rem] flex-1 bg-slate-200/80";

export const PANEL_TREE_SUBGROUP_CHILDREN_CLASS = "mt-1.5 space-y-1 pl-5";

export const PANEL_TREE_GROUP_SECTION_CLASS = "pt-6 first:pt-0";

/** Nagłówek sekcji grupy w pickerze (nieklikalny). */
export const PANEL_TREE_PICKER_GROUP_HEAD_CLASS =
  "relative flex min-h-[42px] items-center rounded-lg py-2.5 pl-3 pr-2 text-[13px] font-semibold leading-snug text-slate-800";

export function panelTreeGroupAccentClass(g: OrderUiMainGroup): string {
  if (g === "NEW") return "bg-blue-500";
  if (g === "IN_PROGRESS") return "bg-amber-500";
  return "bg-emerald-500";
}

/**
 * Usuwa legacy wrapper ---Nazwa--- do wyświetlania; oryginalna nazwa w danych bez zmian.
 */
export function panelTreeDisplaySubgroupTitle(title: string): string {
  const trimmed = title.trim();
  const legacy = trimmed.match(/^(-{2,})(.+?)\1$/);
  if (legacy?.[2]) return legacy[2].trim();
  return title;
}
