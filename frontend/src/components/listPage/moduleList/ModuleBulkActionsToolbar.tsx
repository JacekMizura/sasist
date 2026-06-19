import type { ReactNode } from "react";

import type { PanelBulkSelectionMode } from "../../../hooks/usePanelListBulkSelection";
import { listSellasistInputClass } from "../listSellasistTokens";
import { moduleBulkBarClass, moduleBulkOrSeparatorClass } from "./moduleListViewTokens";

export type ModuleBulkActionsToolbarProps = {
  visible?: boolean;
  bulkSelectMenuKey: number;
  selectDisabled?: boolean;
  selectAriaLabel: string;
  showFilteredOption?: boolean;
  filteredTotalCount?: number;
  onSelectPage: () => void;
  onSelectFiltered?: () => void;
  onClearSelection: () => void;
  onSelectMenuBump: () => void;
  effectiveSelectionCount: number;
  bulkSelectionMode: PanelBulkSelectionMode;
  headerChecked: boolean;
  headerIndeterminate: boolean;
  /** Między „wykonaj” a skrótami — picker statusu, multiakcje itd. */
  primaryActions?: ReactNode;
  showOrBeforeIcons?: boolean;
  iconActions?: ReactNode;
  secondaryActions?: ReactNode;
  trailing?: ReactNode;
};

export function ModuleBulkActionsToolbar({
  visible = true,
  bulkSelectMenuKey,
  selectDisabled = false,
  selectAriaLabel,
  showFilteredOption = false,
  filteredTotalCount = 0,
  onSelectPage,
  onSelectFiltered,
  onClearSelection,
  onSelectMenuBump,
  effectiveSelectionCount,
  bulkSelectionMode,
  headerChecked,
  headerIndeterminate,
  primaryActions,
  showOrBeforeIcons = true,
  iconActions,
  secondaryActions,
  trailing,
}: ModuleBulkActionsToolbarProps) {
  if (!visible) return null;

  return (
    <div className={moduleBulkBarClass}>
      <select
        key={bulkSelectMenuKey}
        defaultValue=""
        disabled={selectDisabled}
        aria-label={selectAriaLabel}
        className={`${listSellasistInputClass} !h-9 max-w-[11rem] shrink-0 text-sm`}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "page") onSelectPage();
          else if (v === "filtered") onSelectFiltered?.();
          else if (v === "clear") {
            onClearSelection();
            onSelectMenuBump();
          }
          e.target.value = "";
        }}
      >
        <option value="">Zaznacz…</option>
        <option value="page">Strona</option>
        {showFilteredOption ? (
          <option value="filtered" disabled={filteredTotalCount < 1}>
            Filtry ({filteredTotalCount})
          </option>
        ) : null}
        <option value="clear">Odznacz</option>
      </select>
      {(headerChecked || headerIndeterminate) && (
        <span className="hidden shrink-0 text-xs text-slate-500 lg:inline" aria-live="polite">
          {bulkSelectionMode === "filtered_all" ? "Pełny zbiór wg filtrów" : headerChecked ? "Strona" : "Częściowo"}
        </span>
      )}
      <span className="shrink-0 text-xs text-slate-500">wykonaj</span>
      {primaryActions}
      {iconActions ? (
        <>
          {showOrBeforeIcons && primaryActions ? (
            <span className={moduleBulkOrSeparatorClass}>lub</span>
          ) : null}
          {iconActions}
        </>
      ) : null}
      {secondaryActions}
      {effectiveSelectionCount > 0 ? (
        <span className="hidden shrink-0 text-[11px] font-medium tabular-nums text-slate-500 sm:inline">
          ({effectiveSelectionCount})
        </span>
      ) : null}
      {trailing ? <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">{trailing}</div> : null}
    </div>
  );
}
