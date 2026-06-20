import type { OrderUiMainGroup } from "../../types/orderUiStatus";

/** Sidebar statusów — 288px (280–288 px docelowo). */
export const PANEL_SIDEBAR_WIDTH_LG_CLASS = "lg:w-[18rem]";

/** Szerokość powłoki listy (zamówienia / zwroty) — ten sam wymiar co sidebar. */
export const PANEL_SIDEBAR_WIDTH_CLASS = "w-[18rem]";

/** Kolumna sidebara na stronie listy — bez zewnętrznej karty (płaski układ). */
export const PANEL_STATUS_SIDEBAR_PAGE_SHELL_BASE =
  "min-h-0 min-w-0 shrink-0 flex-col lg:sticky lg:top-3 lg:z-30 lg:max-h-[calc(100dvh-5.75rem)] lg:overflow-y-auto lg:overscroll-y-contain";

export const PANEL_STATUS_SIDEBAR_PAGE_SHELL_CLASS = `hidden lg:flex ${PANEL_STATUS_SIDEBAR_PAGE_SHELL_BASE}`;

/** Licznik — flex prawo, bez koloru tekstu (neutralny kolor dokłada {@link panelTreeCountClass}). */
export const PANEL_TREE_COUNT_BASE_CLASS =
  "ml-auto shrink-0 pl-2 text-right tabular-nums text-xs font-medium";

/** Licznik — flex prawo, bez stałej szerokości kolumny. */
export const PANEL_TREE_COUNT_CLASS = `${PANEL_TREE_COUNT_BASE_CLASS} text-slate-500`;

export function panelTreeCountClass(active?: boolean): string {
  return `${PANEL_TREE_COUNT_CLASS}${active ? " text-slate-700" : ""}`;
}

export const PANEL_TREE_STATUS_BAR_CLASS = "mt-0.5 h-4 w-1 shrink-0 rounded-full";

/** Stała lewa kolumna na ikony WMS (pusta gdy brak markera). */
export const PANEL_TREE_WMS_ICON_COLUMN_CLASS =
  "flex w-5 shrink-0 items-center justify-center gap-0.5 pt-0.5";

/** Kontener grupy głównej (Nowe / W toku / Zakończone). */
export const PANEL_TREE_GROUP_CONTAINER_BASE =
  "flex items-start gap-1 rounded-lg border px-2 py-2 transition-colors";

export function panelTreeGroupContainerClass(active: boolean): string {
  return `${PANEL_TREE_GROUP_CONTAINER_BASE} ${
    active ? "border-slate-200 bg-slate-100" : "border-slate-200/80 bg-slate-50/70"
  }`;
}

export const PANEL_TREE_GROUP_FILTER_BTN_CLASS =
  "flex min-w-0 flex-1 items-start gap-2 py-0.5 pl-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

export const PANEL_TREE_GROUP_LABEL_CLASS = "text-sm font-semibold leading-snug text-slate-800";

export const PANEL_TREE_GROUP_TOGGLE_CLASS =
  "shrink-0 rounded p-0.5 pt-1 text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

/** Wiersz statusu / meta — lekka lista; kontener tylko gdy active. */
export const PANEL_TREE_STATUS_ROW_BASE =
  "flex w-full items-start gap-1.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

export function panelTreeStatusRowClass(active: boolean): string {
  return `${PANEL_TREE_STATUS_ROW_BASE} ${
    active
      ? "border-slate-200 bg-slate-100 font-medium text-slate-900"
      : "border-transparent font-normal text-slate-700 hover:bg-slate-50"
  }`;
}

export function panelTreeMetaRowClass(active: boolean): string {
  return panelTreeStatusRowClass(active);
}

/** Wiersz operacyjny (zwroty) — bez paska, ikon, kart. */
export function panelTreeOperationalRowClass(active: boolean): string {
  return `flex w-full items-start rounded-lg px-3 py-1.5 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 ${
    active ? "bg-slate-100 font-medium text-slate-900" : "font-normal text-slate-700 hover:bg-slate-50"
  }`;
}

export const PANEL_TREE_GROUP_SECTION_CLASS = "pt-3 first:pt-1";

/** Kontener pod grupą główną — bez wcięcia (poziomy przypisane do elementów). */
export const PANEL_TREE_CHILDREN_CLASS = "mt-1.5 space-y-1";

/** Status bez podgrupy — pierwszy poziom (~16 px od grupy). */
export const PANEL_TREE_LEVEL1_INDENT_CLASS = "pl-4";

export const PANEL_TREE_GROUP_STATUS_LIST_CLASS = `space-y-1 ${PANEL_TREE_LEVEL1_INDENT_CLASS}`;

/** Nagłówek podgrupy — ten sam poziom co status bez podgrupy. */
export const PANEL_TREE_SUBGROUP_SECTION_CLASS =
  "mb-0.5 mt-2 flex w-full items-center gap-2 pr-1 pl-4";

export const PANEL_TREE_SUBGROUP_TOGGLE_CLASS =
  "flex w-5 shrink-0 items-center justify-center rounded text-slate-300 transition-colors hover:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

export const PANEL_TREE_SUBGROUP_TITLE_CLASS = "shrink-0 text-xs font-medium text-slate-400";

export const PANEL_TREE_SUBGROUP_LINE_CLASS = "h-px min-w-[2rem] flex-1 bg-slate-100";

/** Statusy w podgrupie — drugi poziom (~28 px od grupy). */
export const PANEL_TREE_SUBGROUP_CHILDREN_CLASS = "space-y-1 pl-7";

/** Nagłówek sekcji Operacyjne (zwroty). */
export const PANEL_TREE_OPERATIONAL_SECTION_HEADER_CLASS =
  "mb-1 mt-3 flex w-full items-center gap-2 border-t border-slate-100 pt-3";

export const PANEL_TREE_OPERATIONAL_TITLE_CLASS =
  "shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-400";

export const PANEL_TREE_OPERATIONAL_LIST_CLASS = "space-y-0.5";

/** Nagłówek grupy w pickerze (nieklikalny). */
export const PANEL_TREE_PICKER_GROUP_HEAD_CLASS = `${PANEL_TREE_GROUP_CONTAINER_BASE} border-slate-200/80 bg-slate-50/70`;

/** @deprecated v3 używa inline paska w kontenerze grupy. */
export const PANEL_TREE_GROUP_BAR_CLASS =
  "pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-lg";

/** @deprecated v3 — użyj {@link panelTreeGroupContainerClass}. */
export const PANEL_TREE_GROUP_ROW_CLASS = PANEL_TREE_GROUP_FILTER_BTN_CLASS;

export const PANEL_TREE_GROUP_ROW_IDLE_CLASS = "";

/** @deprecated v3 — użyj {@link panelTreeGroupContainerClass}. */
export const PANEL_TREE_GROUP_SHELL_CLASS = PANEL_TREE_GROUP_CONTAINER_BASE;

export const PANEL_TREE_GROUP_SHELL_ACTIVE_CLASS = "border-slate-200 bg-slate-100";

/** @deprecated v3 — ten sam token co status row base. */
export const PANEL_TREE_STATUS_ROW_CLASS = PANEL_TREE_STATUS_ROW_BASE;

export const PANEL_TREE_STATUS_ROW_ACTIVE_CLASS = "border-slate-200 bg-slate-100 font-medium text-slate-900";

export const PANEL_TREE_STATUS_ROW_IDLE_CLASS = "border-transparent font-normal text-slate-700 hover:bg-slate-50";

export const PANEL_TREE_META_ROW_CLASS = PANEL_TREE_STATUS_ROW_BASE;

export const PANEL_TREE_META_ROW_ACTIVE_CLASS = PANEL_TREE_STATUS_ROW_ACTIVE_CLASS;

export const PANEL_TREE_META_ROW_IDLE_CLASS = PANEL_TREE_STATUS_ROW_IDLE_CLASS;

export const PANEL_TREE_STATUS_BAR_IDLE_CLASS = "";

export const PANEL_TREE_STATUS_BAR_ACTIVE_CLASS = "";

export function panelTreeGroupBarHex(g: OrderUiMainGroup): string {
  if (g === "NEW") return "#3b82f6";
  if (g === "IN_PROGRESS") return "#f59e0b";
  return "#10b981";
}

export function panelTreeGroupAccentClass(g: OrderUiMainGroup): string {
  if (g === "NEW") return "bg-blue-500";
  if (g === "IN_PROGRESS") return "bg-amber-500";
  return "bg-emerald-500";
}

export function panelTreeDisplaySubgroupTitle(title: string): string {
  const trimmed = title.trim();
  const legacy = trimmed.match(/^(-{2,})(.+?)\1$/);
  if (legacy?.[2]) return legacy[2].trim();
  return title;
}

export function panelTreeStatusBarClass(_active?: boolean): string {
  return PANEL_TREE_STATUS_BAR_CLASS;
}

/** @deprecated v3 — użyj {@link panelTreeGroupContainerClass}. */
export function panelTreeGroupShellClass(active: boolean): string {
  return panelTreeGroupContainerClass(active);
}
