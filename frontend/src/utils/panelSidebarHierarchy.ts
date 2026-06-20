/**
 * Sidebar hierarchy for panel UI statuses (returns / orders / complaints).
 * Main group rows: group color (Tailwind). Sub-rows: DB hex `substatus.color` with group fallback.
 */

import type { CSSProperties } from "react";

import {
  isValidPanelStatusHex,
  neutralPanelCountBadgeStyle,
  normalizePanelStatusBg,
  pickReadableTextOnBackground,
} from "./panelStatusColor";

export type PanelSidebarMainGroup = "NEW" | "IN_PROGRESS" | "DONE";

/** RGB fallbacks when `substatus.color` is missing or invalid (per main group). */
const GROUP_FALLBACK_RGB: Record<PanelSidebarMainGroup, readonly [number, number, number]> = {
  NEW: [34, 197, 94],
  IN_PROGRESS: [59, 130, 246],
  DONE: [100, 116, 139],
};

function hexToRgbStrict(hex: string): [number, number, number] | null {
  const s = hex.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(s)) return null;
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Resolved accent RGB for a sub-status (DB hex or group fallback). */
export function sidebarSubStatusRgb(
  color: string | null | undefined,
  group: PanelSidebarMainGroup,
): [number, number, number] {
  if (color && isValidPanelStatusHex(color)) {
    const rgb = hexToRgbStrict(color);
    if (rgb) return rgb;
  }
  const fb = GROUP_FALLBACK_RGB[group];
  return [fb[0], fb[1], fb[2]];
}

export function sidebarSubStatusHex(color: string | null | undefined, group: PanelSidebarMainGroup): string {
  const [r, g, b] = sidebarSubStatusRgb(color, group);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Wiersz statusu (kolorowy) — kompaktowy; nie używać na nagłówku podgrupy.
 * Domyślna typografia jak Zwroty (15px). Wariant `compactLabel` — 12px medium, spójny z nagłówkami grup
 * w panelu zamówień (sellasist) i zbliżony wizualnie do gęstszej siatki statusów zwrotów.
 */
const STATUS_ROW_LAYOUT_CLASS =
  "group grid min-h-[28px] w-full grid-cols-[1fr_auto] items-center gap-2 rounded-lg pl-3 pr-1.5 py-0.5 text-left antialiased shadow-sm transition-[box-shadow,filter] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white hover:shadow-md active:translate-y-0";

const STATUS_ROW_LABEL_DEFAULT = "text-[15px] font-semibold tracking-normal";
/** Zgodne z `mainGroupRowClassSellasist` (12px) — podstatusy niestandardowe / lista zamówień. */
const STATUS_ROW_LABEL_COMPACT = "text-[12px] font-medium tracking-normal";

export type PanelSidebarSubRowClassOptions = {
  /** Mniejsza etykieta (np. chrome sellasist na zamówieniach); Zwroty zostają na domyślnym. */
  compactLabel?: boolean;
};

/** Layout + typografia wiersza statusu; kolory z `panelSidebarSubRowStyle` / Rich. */
export function panelSidebarSubRowClass(active: boolean, options?: PanelSidebarSubRowClassOptions): string {
  const typo = options?.compactLabel ? STATUS_ROW_LABEL_COMPACT : STATUS_ROW_LABEL_DEFAULT;
  return `${STATUS_ROW_LAYOUT_CLASS} ${typo} ${
    active ? "ring-2 ring-inset ring-sky-500/35 shadow-md" : "ring-1 ring-inset ring-slate-900/[0.06]"
  }`;
}

/** Alias semantyczny: wiersz statusu panelu (to samo co {@link panelSidebarSubRowClass}). */
export function panelSidebarStatusRowClass(active: boolean, options?: PanelSidebarSubRowClassOptions): string {
  return panelSidebarSubRowClass(active, options);
}

/**
 * Nagłówek zwijanej podgrupy — płaski, neutralny; stała wysokość ~36px (34–40px desktop).
 * Osobne od wiersza statusu: brak wspólnego min-height/padding.
 */
export function panelSidebarSubgroupRowClass(): string {
  return "group grid h-8 w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50 px-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 transition-colors hover:bg-slate-100 active:bg-slate-100";
}

/** Neutral wrapper indent (per-row carries colored left accent). */
export function panelSidebarSubListWrapClass(): string {
  return "ml-3 space-y-1 border-l border-slate-200/80 pl-3";
}

/** Licznik nagłówka podgrupy — prostokątny pill (sekcje zwijane). */
export function panelSidebarSubgroupHeaderCountBadgeClass(): string {
  return "inline-flex h-5 min-w-[1.75rem] shrink-0 items-center justify-center justify-self-end rounded-md border border-slate-300/80 bg-white px-2 text-[10px] font-medium tabular-nums text-slate-700";
}

/**
 * Sub-status row: light tint bg (~12% / ~22% active), full-color left border, focus ring tinted.
 */
export function panelSidebarSubRowStyle(
  color: string | null | undefined,
  group: PanelSidebarMainGroup,
  active: boolean,
): CSSProperties {
  const [r, g, b] = sidebarSubStatusRgb(color, group);
  const a = active ? 0.22 : 0.12;
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${a})`,
    borderLeft: `3px solid rgb(${r}, ${g}, ${b})`,
    boxShadow: active ? `inset 0 0 0 1px rgba(${r}, ${g}, ${b}, 0.35)` : undefined,
  };
}

/** Licznik / chip nagłówka WMS — zawsze neutralny (bez koloru statusu). W sidebarze preferuj {@link panelSidebarSubCountBadgeClass}. */
export function panelSidebarSubCountBadgeStyle(
  _color: string | null | undefined,
  _group: PanelSidebarMainGroup,
): CSSProperties {
  return neutralPanelCountBadgeStyle();
}

/** Licznik przy wierszu podstatusu / przyciskach „Wszystkie” — prostokątny pill, szerszy niż wyższy. */
export function panelSidebarSubCountBadgeClass(): string {
  return "inline-flex h-[1.375rem] min-w-[2rem] shrink-0 items-center justify-center rounded-lg border border-slate-200/90 bg-white px-2.5 text-[11px] font-medium tabular-nums leading-none text-slate-600 antialiased";
}

/** Licznik na głównym wierszu grupy (Nowe / W toku / Zakończone) — nieco większy niż {@link panelSidebarSubCountBadgeClass}. */
export function panelSidebarMainGroupCountBadgeClass(): string {
  return "inline-flex h-6 min-w-[2.25rem] shrink-0 items-center justify-center rounded-xl border border-slate-900/10 bg-white/95 px-2.5 text-[11px] font-semibold tabular-nums leading-none text-slate-800 antialiased";
}

/** Przyciski filtrów: Wszystkie, Bez etykiety (Orders + Returns). */
export function panelSidebarFilterRowClass(active: boolean): string {
  return `group flex min-h-8 w-full items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1 text-left text-[13px] font-medium leading-snug text-slate-800 transition-colors duration-150 antialiased ${
    active
      ? "border-slate-300 bg-slate-50 text-slate-900 ring-1 ring-slate-200/90"
      : "border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/80"
  }`;
}

/** Główny wiersz grupy statusów (zachowane kolory: zielony / niebieski / szary). */
export function panelSidebarMainGroupRowClass(g: PanelSidebarMainGroup, active: boolean): string {
  const base =
    "group flex min-h-8 w-full items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1 text-left text-[13px] font-medium leading-snug tracking-normal antialiased transition-colors duration-150 ";
  const palette =
    g === "NEW"
      ? active
        ? "border-green-600 bg-green-100 font-semibold text-green-950 ring-1 ring-green-300/70"
        : "border-green-200/90 bg-green-50/90 text-green-900 hover:border-green-300/80 hover:bg-green-50/95 active:brightness-[0.99]"
      : g === "IN_PROGRESS"
        ? active
          ? "border-blue-600 bg-blue-100 font-semibold text-blue-950 ring-1 ring-blue-300/70"
          : "border-blue-200/90 bg-blue-50/90 text-blue-950 hover:border-blue-300/80 hover:bg-blue-50/95 active:brightness-[0.99]"
        : active
          ? "border-slate-500 bg-slate-200 font-semibold text-slate-900 ring-1 ring-slate-400/50"
          : "border-slate-200 bg-slate-100 text-slate-800 hover:border-slate-300 hover:bg-slate-50 active:brightness-[0.99]";
  return base + palette;
}

/** Rozszerzone style (Sellasist): osobny kolor paska, tła i tekstu — z fallbackiem do ``color``. */
export type PanelStatusHexBundle = {
  color: string;
  badge_color?: string | null;
  background_color?: string | null;
  text_color?: string | null;
};

export type PanelSidebarSubRowStyleRichOptions = {
  barWidthPx?: number;
  /** Tabela / chip: lekki cień, te same kolory co sidebar — bez „pełnej szerokości”. */
  inlineLabel?: boolean;
  /** Nagłówek szczegółów zamówienia — nieco wyższa krycie tła, bez „inline”. */
  primaryChip?: boolean;
  /** Wiersz drzewa panelu v3 (zamówienia/zwroty) — delikatny tint ~10–14%, bez pełnego fill. */
  treeRow?: boolean;
};

/**
 * Jednolite tło statusu: zawsze niska krycie (spójnie dla koloru z konfiguracji i fallbacku z paska).
 */
export function panelSidebarSubRowStyleRich(
  s: PanelStatusHexBundle | null | undefined,
  group: PanelSidebarMainGroup,
  active: boolean,
  opts?: PanelSidebarSubRowStyleRichOptions,
): CSSProperties {
  const barW = opts?.barWidthPx ?? 6;
  const inlineLabel = opts?.inlineLabel ?? false;
  const primaryChip = opts?.primaryChip ?? false;
  const treeRow = opts?.treeRow ?? false;
  const alphaBoost = primaryChip ? 0.04 : 0;
  const legacy = s?.color;
  const stripe = s?.badge_color && isValidPanelStatusHex(s.badge_color) ? s.badge_color : legacy;
  const [r, g, b] = sidebarSubStatusRgb(stripe, group);
  const aIdleCfg = treeRow ? 0.1 : (inlineLabel ? 0.11 : 0.14) + alphaBoost;
  const aActiveCfg = treeRow ? 0.14 : (inlineLabel ? 0.18 : 0.22) + alphaBoost;
  const aIdleStripe = treeRow ? 0.1 : (inlineLabel ? 0.1 : 0.12) + alphaBoost;
  const aActiveStripe = treeRow ? 0.14 : (inlineLabel ? 0.17 : 0.22) + alphaBoost;
  let backgroundColor: string;
  if (s?.background_color && isValidPanelStatusHex(s.background_color)) {
    const bg = hexToRgbStrict(s.background_color);
    if (bg) {
      const alpha = active ? aActiveCfg : aIdleCfg;
      backgroundColor = `rgba(${bg[0]}, ${bg[1]}, ${bg[2]}, ${alpha})`;
    } else {
      const a = active ? aActiveStripe : aIdleStripe;
      backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  } else {
    const a = active ? aActiveStripe : aIdleStripe;
    backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const stripeHex =
    s?.badge_color && isValidPanelStatusHex(s.badge_color) ? normalizePanelStatusBg(s.badge_color) : sidebarSubStatusHex(legacy, group);
  const bgHex =
    s?.background_color && isValidPanelStatusHex(s.background_color)
      ? normalizePanelStatusBg(s.background_color)
      : stripeHex;
  const tc = pickReadableTextOnBackground(s?.text_color ?? null, bgHex, 4.2);
  const shadow = inlineLabel
    ? active
      ? "inset 0 0 0 1px rgba(15,23,42,0.08)"
      : "inset 0 0 0 1px rgba(15,23,42,0.04)"
    : primaryChip && active
      ? "inset 0 0 0 1px rgba(15,23,42,0.12), 0 2px 8px rgba(15,23,42,0.08)"
      : primaryChip
        ? "inset 0 0 0 1px rgba(15,23,42,0.07), 0 1px 4px rgba(15,23,42,0.05)"
        : active
          ? "inset 0 0 0 1px rgba(15,23,42,0.09), 0 1px 4px rgba(15,23,42,0.06)"
          : "inset 0 0 0 1px rgba(15,23,42,0.05), 0 1px 2px rgba(15,23,42,0.04)";
  return {
    backgroundColor,
    borderLeft: `${barW}px solid ${stripeHex}`,
    color: tc,
    boxShadow: shadow,
  };
}

export function panelSidebarSubCountBadgeStyleRich(
  _s: PanelStatusHexBundle | null | undefined,
  _group: PanelSidebarMainGroup,
): CSSProperties {
  return {};
}
