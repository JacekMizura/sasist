import type { CSSProperties } from "react";

import {
  PANEL_TREE_COUNT_BASE_CLASS,
  PANEL_TREE_COUNT_SOFT_BADGE_CLASS,
  PANEL_TREE_COUNT_SOLID_BADGE_CLASS,
} from "./panelStatusTreeStyles";
import { blendHexOverWhite, isValidPanelStatusHex, contrastingTextColor } from "../../utils/panelStatusColor";

type Props = {
  value: number | string;
  active?: boolean;
  /** Opcjonalny kolor licznika (kategoria / konfiguracja). */
  colorHex?: string | null;
  /**
   * `soft` — jasny pill (statusy, Wszystkie).
   * `solid` — wypełniony badge grupy głównej (biały tekst).
   */
  variant?: "soft" | "solid";
};

function softBadgeStyle(hex: string, active?: boolean): CSSProperties {
  const alpha = active ? 0.22 : 0.14;
  return {
    backgroundColor: blendHexOverWhite(hex, alpha),
    borderColor: blendHexOverWhite(hex, 0.35),
    color: hex.toLowerCase(),
  };
}

function solidBadgeStyle(hex: string): CSSProperties {
  const bg = hex.toLowerCase();
  return {
    backgroundColor: bg,
    color: contrastingTextColor(bg),
  };
}

export function PanelTreeCount({ value, active, colorHex, variant = "soft" }: Props) {
  const hex = colorHex?.trim();
  const colored = Boolean(hex && isValidPanelStatusHex(hex));

  if (variant === "solid") {
    return (
      <span
        className={`${PANEL_TREE_COUNT_BASE_CLASS} ${PANEL_TREE_COUNT_SOLID_BADGE_CLASS}`}
        style={colored ? solidBadgeStyle(hex!) : { backgroundColor: "#94a3b8", color: "#ffffff" }}
      >
        {value}
      </span>
    );
  }

  return (
    <span
      className={`${PANEL_TREE_COUNT_BASE_CLASS} ${PANEL_TREE_COUNT_SOFT_BADGE_CLASS}${
        active && !colored ? " border-slate-300 bg-slate-200/80 text-slate-800" : ""
      }`}
      style={colored ? softBadgeStyle(hex!, active) : undefined}
    >
      {value}
    </span>
  );
}
