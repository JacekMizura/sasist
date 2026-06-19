import { ChevronDown, ChevronRight } from "lucide-react";

import {
  PANEL_TREE_COUNT_CLASS,
  PANEL_TREE_SUBGROUP_LINE_CLASS,
  PANEL_TREE_SUBGROUP_SECTION_CLASS,
  PANEL_TREE_SUBGROUP_TITLE_CLASS,
  PANEL_TREE_SUBGROUP_TOGGLE_CLASS,
  panelTreeDisplaySubgroupTitle,
} from "./panelStatusTreeStyles";

export type PanelSubgroupLineHeaderProps = {
  title: string;
  totalCount?: number;
  expanded: boolean;
  onToggle: () => void;
  /** Ukryj licznik (np. picker masowy). */
  showCount?: boolean;
};

/**
 * Nagłówek sekcji podgrupy — etykieta + linia (+ opcjonalny licznik).
 * Chevron tylko do zwijania; nie wygląda jak wiersz statusu.
 */
export function PanelSubgroupLineHeader({
  title,
  totalCount,
  expanded,
  onToggle,
  showCount = true,
}: PanelSubgroupLineHeaderProps) {
  const displayTitle = panelTreeDisplaySubgroupTitle(title);

  return (
    <div className={PANEL_TREE_SUBGROUP_SECTION_CLASS}>
      <button
        type="button"
        onClick={onToggle}
        className={PANEL_TREE_SUBGROUP_TOGGLE_CLASS}
        aria-expanded={expanded}
        aria-label={expanded ? "Zwiń podgrupę" : "Rozwiń podgrupę"}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        )}
      </button>
      <span className={PANEL_TREE_SUBGROUP_TITLE_CLASS}>{displayTitle}</span>
      <span className={PANEL_TREE_SUBGROUP_LINE_CLASS} aria-hidden />
      {showCount && totalCount !== undefined ? (
        <span className={PANEL_TREE_COUNT_CLASS}>{totalCount}</span>
      ) : null}
    </div>
  );
}
