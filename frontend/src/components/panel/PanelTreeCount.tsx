import {
  PANEL_TREE_COUNT_BASE_CLASS,
  PANEL_TREE_COUNT_PROBLEM_BADGE_CLASS,
  PANEL_TREE_COUNT_SOFT_BADGE_CLASS,
} from "./panelStatusTreeStyles";

type Props = {
  value: number | string;
  active?: boolean;
  /**
   * Zachowane dla kompatybilności — w panelu statusów nie kolorujemy kapsułek kategorią.
   */
  colorHex?: string | null;
  /** Zachowane dla kompatybilności. */
  variant?: "soft" | "solid";
  /** Czerwona kapsułka tylko dla problemów (braki / alerty). */
  tone?: "neutral" | "problem";
};

/**
 * Licznik statusu / grupy — mała kapsułka; domyślnie szara.
 */
export function PanelTreeCount({ value, active, tone = "neutral" }: Props) {
  const badge =
    tone === "problem" ? PANEL_TREE_COUNT_PROBLEM_BADGE_CLASS : PANEL_TREE_COUNT_SOFT_BADGE_CLASS;
  const activeNeutral =
    tone === "neutral" && active ? " border-slate-300 bg-slate-100 text-slate-800" : "";

  return (
    <span className={`${PANEL_TREE_COUNT_BASE_CLASS} ${badge}${activeNeutral}`}>{value}</span>
  );
}
