import type { CSSProperties } from "react";

import {
  PANEL_TREE_STATUS_ROW_BASE,
  PANEL_TREE_STATUS_ACTIVE_BAR_HEX,
  panelTreeStatusRowClass,
} from "../components/panel/panelStatusTreeStyles";
import {
  type PanelSidebarMainGroup,
  type PanelStatusHexBundle,
  panelSidebarSubRowStyleRich,
  sidebarSubStatusHex,
} from "./panelSidebarHierarchy";
import {
  blendHexOverWhite,
  isValidPanelStatusHex,
  normalizePanelStatusBg,
  pickReadableTextOnBackground,
} from "./panelStatusColor";

/** Tint tła wiersza statusu — tylko tryb „rich” (np. komórki tabeli). */
export const PANEL_TREE_ROW_TINT_ALPHA = {
  idle: 0.1,
  active: 0.14,
} as const;

export type PanelTreeStatusRowChrome = "sidebar" | "rich";

export type PanelTreeStatusRowPresentation = {
  rowClassName: string;
  rowStyle: CSSProperties | undefined;
  labelStyle: CSSProperties | undefined;
  stripeHex: string;
};

function treeRowBackgroundHex(status: PanelStatusHexBundle, mainGroup: PanelSidebarMainGroup): string {
  if (status.background_color && isValidPanelStatusHex(status.background_color)) {
    return normalizePanelStatusBg(status.background_color);
  }
  return sidebarSubStatusHex(status.badge_color ?? status.color, mainGroup);
}

/**
 * Kolory wiersza podstatusu w drzewie panelu (zamówienia / zwroty).
 *
 * ``sidebar``: bez dużego tintu; aktywny = pomarańczowy pasek z lewej.
 * ``rich``: legacy tint (komórki tabeli / kompakt).
 */
export function panelTreeStatusRowPresentation(
  status: PanelStatusHexBundle,
  mainGroup: PanelSidebarMainGroup,
  active: boolean,
  chrome: PanelTreeStatusRowChrome = "rich",
): PanelTreeStatusRowPresentation {
  const statusStripe =
    status.badge_color && isValidPanelStatusHex(status.badge_color)
      ? normalizePanelStatusBg(status.badge_color)
      : sidebarSubStatusHex(status.color, mainGroup);

  if (chrome === "sidebar") {
    return {
      rowClassName: panelTreeStatusRowClass(active),
      rowStyle: undefined,
      labelStyle:
        status.text_color && isValidPanelStatusHex(status.text_color)
          ? { color: pickReadableTextOnBackground(status.text_color, "#ffffff", 4.5) }
          : undefined,
      stripeHex: active ? PANEL_TREE_STATUS_ACTIVE_BAR_HEX : statusStripe,
    };
  }

  const hasBg = Boolean(status.background_color && isValidPanelStatusHex(status.background_color));
  const hasText = Boolean(status.text_color && isValidPanelStatusHex(status.text_color));
  const rich = panelSidebarSubRowStyleRich(status, mainGroup, active, {
    barWidthPx: 0,
    treeRow: true,
  });
  const stripeHex = statusStripe;

  const tintAlpha = active ? PANEL_TREE_ROW_TINT_ALPHA.active : PANEL_TREE_ROW_TINT_ALPHA.idle;
  const contrastBase = hasBg
    ? blendHexOverWhite(treeRowBackgroundHex(status, mainGroup), tintAlpha)
    : active
      ? blendHexOverWhite(stripeHex, 0.12)
      : "#ffffff";

  const idleBorder = "border-slate-200";
  const activeBorderClass = "border-slate-300 font-semibold";
  const activeRing = active
    ? {
        boxShadow: `inset 0 0 0 1px ${blendHexOverWhite(stripeHex, 0.45)}`,
      }
    : undefined;

  return {
    rowClassName: hasBg
      ? `${PANEL_TREE_STATUS_ROW_BASE} ${
          active ? `${activeBorderClass}` : `${idleBorder} font-medium hover:bg-slate-50`
        }`
      : panelTreeStatusRowClass(active),
    rowStyle: hasBg
      ? {
          backgroundColor: rich.backgroundColor,
          ...activeRing,
        }
      : active
        ? {
            backgroundColor: blendHexOverWhite(stripeHex, 0.1),
            ...activeRing,
          }
        : undefined,
    labelStyle: hasText
      ? { color: pickReadableTextOnBackground(status.text_color, contrastBase, 4.5) }
      : undefined,
    stripeHex,
  };
}

/** Status „problemowy” → czerwona kapsułka licznika (UI only). */
export function panelTreeStatusIsProblem(name: string | null | undefined): boolean {
  return /brak|niedobór|niedobor|shortage|deficyt|missing|niekomplet|problem|błąd|blad|error|awaria|reklamac/i.test(
    (name ?? "").trim(),
  );
}
