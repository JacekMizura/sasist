import type { OrderUiMainGroup } from "../../types/orderUiStatus";

/** Plain-text licznik — stała kolumna, wyrównanie do prawej (bez badge). */
export const PANEL_TREE_COUNT_CLASS =
  "w-12 shrink-0 text-right tabular-nums text-xs font-medium text-slate-500";

/** Nagłówek sekcji Operacyjne (zwroty) — etykieta + linia. */
export const PANEL_TREE_OPERATIONAL_SECTION_HEADER_CLASS =
  "mb-1 mt-2 flex w-full items-center gap-2 pr-1";

export const PANEL_TREE_OPERATIONAL_TITLE_CLASS =
  "shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-400";

export const PANEL_TREE_OPERATIONAL_LIST_CLASS = "space-y-1.5";

/** Pasek grupy — pełna wysokość wiersza. */
export const PANEL_TREE_GROUP_BAR_CLASS =
  "pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-lg";

/** Pasek statusu — inline, za kolumną ikon WMS. */
export const PANEL_TREE_STATUS_BAR_CLASS =
  "mr-1.5 h-4 w-1 shrink-0 rounded-full transition-opacity duration-150";

/** Stała lewa kolumna na ikony WMS (pusta gdy brak markera). */
export const PANEL_TREE_WMS_ICON_COLUMN_CLASS =
  "flex w-5 shrink-0 items-center justify-center gap-0.5";

export const PANEL_TREE_GROUP_ROW_CLASS =
  "relative flex min-h-0 flex-1 items-center gap-2 overflow-hidden rounded-l-lg px-3 py-2.5 text-left text-sm font-semibold leading-snug text-slate-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

export const PANEL_TREE_GROUP_ROW_IDLE_CLASS = "hover:bg-slate-50";

export const PANEL_TREE_GROUP_SHELL_CLASS =
  "flex overflow-hidden rounded-lg border border-transparent transition-colors";

export const PANEL_TREE_GROUP_SHELL_ACTIVE_CLASS = "border-slate-200 bg-slate-100";

export const PANEL_TREE_GROUP_TOGGLE_CLASS =
  "flex shrink-0 items-center self-stretch border-l border-slate-100/90 px-2.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

/** Odstęp między nagłówkiem grupy a dziećmi — bez wcięcia poziomego (wcięcia per poziom). */
export const PANEL_TREE_CHILDREN_CLASS = "mt-3 space-y-0";

/** Statusy przypisane bezpośrednio do grupy głównej. */
export const PANEL_TREE_GROUP_STATUS_LIST_CLASS = "space-y-1.5 pl-4";

/** Nagłówek sekcji podgrupy — ten sam poziom co statusy grupy (nie głębiej). */
export const PANEL_TREE_SUBGROUP_SECTION_CLASS = "mb-0.5 mt-2 flex w-full items-center gap-2 pl-4 pr-1";

export const PANEL_TREE_SUBGROUP_TOGGLE_CLASS =
  "flex w-5 shrink-0 items-center justify-center rounded text-slate-300 transition-colors hover:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

export const PANEL_TREE_SUBGROUP_TITLE_CLASS = "shrink-0 text-xs font-medium text-slate-400";

export const PANEL_TREE_SUBGROUP_LINE_CLASS = "h-px min-w-[2rem] flex-1 bg-slate-100";

/** Statusy pod podgrupą — jeden poziom głębiej niż statusy grupy. */
export const PANEL_TREE_SUBGROUP_CHILDREN_CLASS = "mb-0.5 space-y-1.5 pl-7";

export const PANEL_TREE_GROUP_SECTION_CLASS = "pt-7 first:pt-2";

/** Pełnowierszowy element listy — status. */
export const PANEL_TREE_STATUS_ROW_CLASS =
  "group relative flex w-full items-center gap-2 overflow-hidden rounded-lg border border-transparent px-3 py-2 text-left text-sm leading-snug text-slate-700 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

export const PANEL_TREE_STATUS_ROW_ACTIVE_CLASS = "border-slate-200 bg-slate-100 font-medium text-slate-900";

export const PANEL_TREE_STATUS_ROW_IDLE_CLASS = "hover:bg-slate-50";

export const PANEL_TREE_STATUS_BAR_IDLE_CLASS = "opacity-70 group-hover:opacity-100";

export const PANEL_TREE_STATUS_BAR_ACTIVE_CLASS = "opacity-100";

/** Meta-filtry (Wszystkie, Bez etykiety). */
export const PANEL_TREE_META_ROW_CLASS =
  "flex w-full items-center justify-between overflow-hidden rounded-lg border border-transparent px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

export const PANEL_TREE_META_ROW_ACTIVE_CLASS = "border-slate-200 bg-slate-100 text-slate-900";

export const PANEL_TREE_META_ROW_IDLE_CLASS = "hover:bg-slate-50";

/** Nagłówek grupy w pickerze (nieklikalny). */
export const PANEL_TREE_PICKER_GROUP_HEAD_CLASS =
  "relative flex items-center overflow-hidden rounded-lg px-3 py-2.5 text-sm font-semibold leading-snug text-slate-800";

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

export function panelTreeMetaRowClass(active: boolean): string {
  return `${PANEL_TREE_META_ROW_CLASS} ${active ? PANEL_TREE_META_ROW_ACTIVE_CLASS : PANEL_TREE_META_ROW_IDLE_CLASS}`;
}

export function panelTreeStatusRowClass(active: boolean): string {
  return `${PANEL_TREE_STATUS_ROW_CLASS} ${active ? PANEL_TREE_STATUS_ROW_ACTIVE_CLASS : PANEL_TREE_STATUS_ROW_IDLE_CLASS}`;
}

export function panelTreeStatusBarClass(active: boolean): string {
  return `${PANEL_TREE_STATUS_BAR_CLASS} ${active ? PANEL_TREE_STATUS_BAR_ACTIVE_CLASS : PANEL_TREE_STATUS_BAR_IDLE_CLASS}`;
}

export function panelTreeGroupShellClass(active: boolean): string {
  return `${PANEL_TREE_GROUP_SHELL_CLASS} ${active ? PANEL_TREE_GROUP_SHELL_ACTIVE_CLASS : ""}`;
}
