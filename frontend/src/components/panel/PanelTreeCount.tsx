import type { CSSProperties } from "react";

import {
  PANEL_TREE_COUNT_BASE_CLASS,
  PANEL_TREE_COUNT_SOFT_BADGE_CLASS,
} from "./panelStatusTreeStyles";
import { blendHexOverWhite, isValidPanelStatusHex, pickReadableTextOnBackground } from "../../utils/panelStatusColor";

type Props = {
  value: number | string;
  active?: boolean;
  /**
   * Kolor kategorii — używany wyłącznie gdy ``active`` (lekki tint).
   * Idle zawsze: białe tło + cienka ramka + ciemny tekst.
   */
  colorHex?: string | null;
  /** Zachowane dla kompatybilności — obie wartości = ten sam subtelny badge. */
  variant?: "soft" | "solid";
};

/** Aktywny wiersz: delikatny tint kategorii (nie pastylka). */
function activeTintStyle(hex: string): CSSProperties {
  const bg = blendHexOverWhite(hex, 0.12);
  return {
    backgroundColor: bg,
    borderColor: blendHexOverWhite(hex, 0.28),
    color: pickReadableTextOnBackground(hex, bg, 4.5),
  };
}

/**
 * Licznik statusu / grupy — mały okrągły badge (~28 px), hierarchia: nazwa > liczba.
 */
export function PanelTreeCount({ value, active, colorHex }: Props) {
  const hex = colorHex?.trim();
  const useTint = Boolean(active && hex && isValidPanelStatusHex(hex));

  return (
    <span
      className={`${PANEL_TREE_COUNT_BASE_CLASS} ${PANEL_TREE_COUNT_SOFT_BADGE_CLASS}${
        active && !useTint ? " border-slate-300 bg-slate-50 text-slate-800" : ""
      }`}
      style={useTint ? activeTintStyle(hex!) : undefined}
    >
      {value}
    </span>
  );
}
