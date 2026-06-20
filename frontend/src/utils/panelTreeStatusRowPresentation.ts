import type { CSSProperties } from "react";

import {
  PANEL_TREE_STATUS_ROW_BASE,
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

/** Tint tła wiersza statusu na białym sidebarze (nie pełny fill). */
export const PANEL_TREE_ROW_TINT_ALPHA = {
  idle: 0.1,
  active: 0.14,
} as const;

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
 * badge_color → lewy pasek
 * background_color → delikatny tint (~10–14%)
 * text_color → nazwa (z kontrolą kontrastu na zblendowanym tle)
 * counter_color → osobno w PanelTreeCount (localStorage)
 *
 * Grupy główne (Nowe / W toku / Zakończone) nie używają tej funkcji.
 */
export function panelTreeStatusRowPresentation(
  status: PanelStatusHexBundle,
  mainGroup: PanelSidebarMainGroup,
  active: boolean,
): PanelTreeStatusRowPresentation {
  const hasBg = Boolean(status.background_color && isValidPanelStatusHex(status.background_color));
  const hasText = Boolean(status.text_color && isValidPanelStatusHex(status.text_color));
  const rich = panelSidebarSubRowStyleRich(status, mainGroup, active, {
    barWidthPx: 0,
    treeRow: true,
  });
  const stripeHex =
    status.badge_color && isValidPanelStatusHex(status.badge_color)
      ? normalizePanelStatusBg(status.badge_color)
      : sidebarSubStatusHex(status.color, mainGroup);

  const tintAlpha = active ? PANEL_TREE_ROW_TINT_ALPHA.active : PANEL_TREE_ROW_TINT_ALPHA.idle;
  const contrastBase = hasBg
    ? blendHexOverWhite(treeRowBackgroundHex(status, mainGroup), tintAlpha)
    : active
      ? "#f1f5f9"
      : "#ffffff";

  return {
    rowClassName: hasBg
      ? `${PANEL_TREE_STATUS_ROW_BASE} ${
          active ? "border-slate-200/80 font-medium" : "border-transparent font-normal"
        }`
      : panelTreeStatusRowClass(active),
    rowStyle: hasBg
      ? {
          backgroundColor: rich.backgroundColor,
          boxShadow: rich.boxShadow,
        }
      : undefined,
    labelStyle: hasText
      ? { color: pickReadableTextOnBackground(status.text_color, contrastBase, 4.5) }
      : undefined,
    stripeHex,
  };
}
