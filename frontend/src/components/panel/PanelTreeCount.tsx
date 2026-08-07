import type { CSSProperties } from "react";

import {
  PANEL_TREE_COUNT_BASE_CLASS,
  PANEL_TREE_COUNT_PROBLEM_BADGE_CLASS,
  PANEL_TREE_COUNT_SOFT_BADGE_CLASS,
} from "./panelStatusTreeStyles";
import { blendHexOverWhite, isValidPanelStatusHex, pickReadableTextOnBackground } from "../../utils/panelStatusColor";

type Props = {
  value: number | string;
  active?: boolean;
  /**
   * Kolor kategorii — lekki tint gdy ``active`` (nie pastylka solid).
   */
  colorHex?: string | null;
  /** Zachowane dla kompatybilności. */
  variant?: "soft" | "solid";
  /** Czerwona kapsułka dla problemów (nadpisuje tint kategorii). */
  tone?: "neutral" | "problem";
};

function activeTintStyle(hex: string): CSSProperties {
  const bg = blendHexOverWhite(hex, 0.12);
  return {
    backgroundColor: bg,
    borderColor: blendHexOverWhite(hex, 0.28),
    color: pickReadableTextOnBackground(hex, bg, 4.5),
  };
}

/**
 * Licznik statusu / grupy — mała kapsułka; aktywny + colorHex → delikatny tint kategorii.
 */
export function PanelTreeCount({ value, active, colorHex, tone = "neutral" }: Props) {
  if (tone === "problem") {
    return (
      <span className={`${PANEL_TREE_COUNT_BASE_CLASS} ${PANEL_TREE_COUNT_PROBLEM_BADGE_CLASS}`}>
        {value}
      </span>
    );
  }

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
