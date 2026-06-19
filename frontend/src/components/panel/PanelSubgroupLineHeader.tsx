import { ChevronDown, ChevronRight } from "lucide-react";

import {
  PANEL_TREE_COUNT_CLASS,
  PANEL_TREE_SUBGROUP_HEAD_CLASS,
  PANEL_TREE_SUBGROUP_LINE_CLASS,
  PANEL_TREE_SUBGROUP_TITLE_CLASS,
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
 * Nagłówek podgrupy: nazwa + linia + opcjonalny licznik.
 * Chevron tylko do zwijania — nie filtr.
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
    <button type="button" onClick={onToggle} className={PANEL_TREE_SUBGROUP_HEAD_CLASS} aria-expanded={expanded}>
      <span className="flex w-4 shrink-0 items-center justify-center text-slate-300">
        {expanded ? (
          <ChevronDown className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        ) : (
          <ChevronRight className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        )}
      </span>
      <span className={PANEL_TREE_SUBGROUP_TITLE_CLASS}>{displayTitle}</span>
      <span className={PANEL_TREE_SUBGROUP_LINE_CLASS} aria-hidden />
      {showCount && totalCount !== undefined ? (
        <span className={PANEL_TREE_COUNT_CLASS}>{totalCount}</span>
      ) : null}
    </button>
  );
}
