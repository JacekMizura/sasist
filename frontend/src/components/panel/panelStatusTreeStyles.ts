import type { OrderUiMainGroup } from "../../types/orderUiStatus";

/** Sidebar statusów — 288px (280–288 px docelowo). */
export const PANEL_SIDEBAR_WIDTH_LG_CLASS = "lg:w-[18rem]";

/** Szerokość powłoki listy (zamówienia / zwroty) — ten sam wymiar co sidebar. */
export const PANEL_SIDEBAR_WIDTH_CLASS = "w-[18rem]";

/** Kolumna sidebara na stronie listy — bez zewnętrznej karty (płaski układ). */
export const PANEL_STATUS_SIDEBAR_PAGE_SHELL_BASE =
  "min-h-0 min-w-0 shrink-0 flex-col lg:sticky lg:top-3 lg:z-30 lg:max-h-[calc(100dvh-5.75rem)] lg:overflow-y-auto lg:overscroll-y-contain";

export const PANEL_STATUS_SIDEBAR_PAGE_SHELL_CLASS = `hidden lg:flex ${PANEL_STATUS_SIDEBAR_PAGE_SHELL_BASE}`;

/** Wyszukiwarka statusów — pełna szerokość, pill. */
export const PANEL_TREE_SEARCH_WRAP_CLASS = "relative mb-3";

export const PANEL_TREE_SEARCH_ICON_CLASS =
  "pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400";

export const PANEL_TREE_SEARCH_INPUT_CLASS =
  "w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-100";

/** Licznik — baza (badge dokłada PanelTreeCount). */
export const PANEL_TREE_COUNT_BASE_CLASS = "shrink-0";

/** Soft badge (Wszystkie / statusy) — zaokrąglony pill. */
export const PANEL_TREE_COUNT_SOFT_BADGE_CLASS =
  "inline-flex h-[1.25rem] min-w-[1.5rem] items-center justify-center rounded-full border border-slate-200/90 bg-slate-100 px-2 text-[10px] font-semibold tabular-nums leading-none text-slate-600";

/** Solid badge grupy głównej — kolor kategorii, biały tekst. */
export const PANEL_TREE_COUNT_SOLID_BADGE_CLASS =
  "inline-flex h-[1.375rem] min-w-[1.75rem] items-center justify-center rounded-full px-2 text-[10px] font-bold tabular-nums leading-none text-white shadow-sm";

/** @deprecated — użyj PanelTreeCount variant. */
export const PANEL_TREE_COUNT_CLASS = `${PANEL_TREE_COUNT_BASE_CLASS} ${PANEL_TREE_COUNT_SOFT_BADGE_CLASS}`;

export function panelTreeCountClass(_active?: boolean): string {
  return `${PANEL_TREE_COUNT_BASE_CLASS} ${PANEL_TREE_COUNT_SOFT_BADGE_CLASS}`;
}

/** Lewy pasek koloru na kafelku statusu. */
export const PANEL_TREE_STATUS_BAR_CLASS = "mt-0.5 h-[1.05rem] w-1 shrink-0 rounded-full";

/** Stała lewa kolumna na ikony WMS (pusta gdy brak markera). */
export const PANEL_TREE_WMS_ICON_COLUMN_CLASS =
  "flex w-5 shrink-0 items-center justify-center gap-0.5 pt-0.5";

/** Nagłówek grupy głównej — płaski (kropka + uppercase + badge + chevron). */
export const PANEL_TREE_GROUP_CONTAINER_BASE =
  "flex items-center gap-1.5 rounded-lg px-0.5 py-1.5 transition-colors";

export function panelTreeGroupContainerClass(active: boolean): string {
  return `${PANEL_TREE_GROUP_CONTAINER_BASE} ${active ? "bg-slate-50/90" : ""}`;
}

export const PANEL_TREE_GROUP_FILTER_BTN_CLASS =
  "flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

export const PANEL_TREE_GROUP_DOT_CLASS = "h-2.5 w-2.5 shrink-0 rounded-full";

export const PANEL_TREE_GROUP_LABEL_CLASS =
  "text-[11px] font-extrabold uppercase tracking-wide text-slate-800";

export const PANEL_TREE_GROUP_LOCK_CLASS = "h-3 w-3 shrink-0 text-slate-300";

export const PANEL_TREE_GROUP_TOGGLE_CLASS =
  "shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

/**
 * Kafelek statusu — zawsze ramka + białe tło; active = mocniejsza ramka + tint.
 */
export const PANEL_TREE_STATUS_ROW_BASE =
  "flex w-full items-start gap-1.5 rounded-lg border bg-white px-2.5 py-2 text-left text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

export function panelTreeStatusRowClass(active: boolean): string {
  return `${PANEL_TREE_STATUS_ROW_BASE} ${
    active
      ? "border-slate-300 bg-slate-50 font-semibold text-slate-900 shadow-sm"
      : "border-slate-200 font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50/80"
  }`;
}

/** Meta (Wszystkie / Bez etykiety) — bez paska, lekki wiersz + badge. */
export function panelTreeMetaRowClass(active: boolean): string {
  return `flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 ${
    active
      ? "font-semibold text-slate-900"
      : "font-semibold text-slate-700 hover:bg-slate-50"
  }`;
}

/** Wiersz operacyjny (zwroty) — bez paska, ikon, kart. */
export function panelTreeOperationalRowClass(active: boolean): string {
  return `flex w-full items-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 ${
    active
      ? "border-slate-300 bg-slate-50 font-medium text-slate-900"
      : "font-normal text-slate-700 hover:bg-slate-50"
  }`;
}

/** Odstęp między głównymi grupami — wyraźna separacja jak na mockupie. */
export const PANEL_TREE_GROUP_SECTION_CLASS = "mt-5 first:mt-3";

/** Kontener pod grupą główną. */
export const PANEL_TREE_CHILDREN_CLASS = "mt-2 space-y-1.5";

/** Status bez podgrupy — lekki wcięcie. */
export const PANEL_TREE_LEVEL1_INDENT_CLASS = "pl-1";

export const PANEL_TREE_GROUP_STATUS_LIST_CLASS = `space-y-1.5 ${PANEL_TREE_LEVEL1_INDENT_CLASS}`;

/** Nagłówek podgrupy — mały uppercase, szary (nie wygląda jak status). */
export const PANEL_TREE_SUBGROUP_SECTION_CLASS =
  "mb-1 mt-3 flex w-full items-center gap-1.5 pr-1 pl-1";

export const PANEL_TREE_SUBGROUP_TOGGLE_CLASS =
  "flex w-4 shrink-0 items-center justify-center rounded text-slate-300 transition-colors hover:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

export const PANEL_TREE_SUBGROUP_TITLE_CLASS =
  "shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400";

export const PANEL_TREE_SUBGROUP_LINE_CLASS = "h-px min-w-[1rem] flex-1 bg-transparent";

/** Statusy w podgrupie. */
export const PANEL_TREE_SUBGROUP_CHILDREN_CLASS = "space-y-1.5 pl-2";

/** Nagłówek sekcji Operacyjne (zwroty). */
export const PANEL_TREE_OPERATIONAL_SECTION_HEADER_CLASS =
  "mb-1.5 mt-5 flex w-full items-center gap-2 border-t border-slate-100 pt-4";

export const PANEL_TREE_OPERATIONAL_TITLE_CLASS =
  "shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400";

export const PANEL_TREE_OPERATIONAL_LIST_CLASS = "space-y-1.5";

/** Nagłówek grupy w pickerze (nieklikalny). */
export const PANEL_TREE_PICKER_GROUP_HEAD_CLASS = `${PANEL_TREE_GROUP_CONTAINER_BASE}`;

/** @deprecated — grupa używa kropki, nie paska. */
export const PANEL_TREE_GROUP_BAR_CLASS =
  "pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-lg";

/** @deprecated v3 — użyj {@link panelTreeGroupContainerClass}. */
export const PANEL_TREE_GROUP_ROW_CLASS = PANEL_TREE_GROUP_FILTER_BTN_CLASS;

export const PANEL_TREE_GROUP_ROW_IDLE_CLASS = "";

/** @deprecated v3 — użyj {@link panelTreeGroupContainerClass}. */
export const PANEL_TREE_GROUP_SHELL_CLASS = PANEL_TREE_GROUP_CONTAINER_BASE;

export const PANEL_TREE_GROUP_SHELL_ACTIVE_CLASS = "bg-slate-50/90";

/** @deprecated v3 — ten sam token co status row base. */
export const PANEL_TREE_STATUS_ROW_CLASS = PANEL_TREE_STATUS_ROW_BASE;

export const PANEL_TREE_STATUS_ROW_ACTIVE_CLASS =
  "border-slate-300 bg-slate-50 font-semibold text-slate-900 shadow-sm";

export const PANEL_TREE_STATUS_ROW_IDLE_CLASS =
  "border-slate-200 font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50/80";

export const PANEL_TREE_META_ROW_CLASS =
  "flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-[13px]";

export const PANEL_TREE_META_ROW_ACTIVE_CLASS = "font-semibold text-slate-900";

export const PANEL_TREE_META_ROW_IDLE_CLASS = "font-semibold text-slate-700 hover:bg-slate-50";

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
