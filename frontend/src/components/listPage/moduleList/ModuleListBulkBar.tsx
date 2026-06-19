import type { ReactNode } from "react";

import type { PanelBulkSelectionMode } from "../../../hooks/usePanelListBulkSelection";
import { ModuleBulkActionsToolbar } from "./ModuleBulkActionsToolbar";
import { moduleBulkDangerBtnClass, moduleBulkTextBtnClass } from "./moduleListViewTokens";

export type ModuleListBulkBarProps = {
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
  /** Picker statusu lub inna akcja po „wykonaj”. */
  actionSlot: ReactNode;
  showDelete?: boolean;
  deleteDisabled?: boolean;
  deleteTitle?: string;
  onDelete?: () => void;
  clearDisabled?: boolean;
};

/**
 * Kanoniczny pasek multiakcji list modułu — wzorzec zwrotów:
 * Zaznacz… | wykonaj | actionSlot | [Usuń] | Odznacz
 */
export function ModuleListBulkBar({
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
  actionSlot,
  showDelete = false,
  deleteDisabled = false,
  deleteTitle,
  onDelete,
  clearDisabled = false,
}: ModuleListBulkBarProps) {
  return (
    <ModuleBulkActionsToolbar
      bulkSelectMenuKey={bulkSelectMenuKey}
      selectDisabled={selectDisabled}
      selectAriaLabel={selectAriaLabel}
      showFilteredOption={showFilteredOption}
      filteredTotalCount={filteredTotalCount}
      onSelectPage={onSelectPage}
      onSelectFiltered={onSelectFiltered}
      onClearSelection={onClearSelection}
      onSelectMenuBump={onSelectMenuBump}
      effectiveSelectionCount={effectiveSelectionCount}
      bulkSelectionMode={bulkSelectionMode}
      headerChecked={headerChecked}
      headerIndeterminate={headerIndeterminate}
      primaryActions={actionSlot}
      showOrBeforeIcons={false}
      secondaryActions={
        <>
          {showDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleteDisabled}
              title={deleteTitle}
              className={moduleBulkDangerBtnClass}
            >
              Usuń
            </button>
          ) : null}
          <button
            type="button"
            disabled={clearDisabled}
            className={moduleBulkTextBtnClass}
            onClick={() => {
              onClearSelection();
              onSelectMenuBump();
            }}
          >
            Odznacz
          </button>
        </>
      }
    />
  );
}
