import { Download } from "lucide-react";

import type { PanelBulkSelectionMode } from "../../../hooks/usePanelListBulkSelection";
import {
  ModuleBulkActionsToolbar,
  moduleBulkIconBtnClass,
  moduleBulkTextBtnClass,
} from "../../listPage/moduleList";
import { BundleListMultiActionsMenu, type BundleMultiMenuActionId } from "./BundleListMultiActionsMenu";

export type BundlesListBulkBarProps = {
  bulkSelectMenuKey: number;
  bulkToolbarDisabled: boolean;
  totalCount: number;
  effectiveSelectionCount: number;
  bulkSelectionMode: PanelBulkSelectionMode;
  headerChecked: boolean;
  headerIndeterminate: boolean;
  onSelectPage: () => void;
  onSelectFiltered: () => void;
  onClearSelection: () => void;
  onSelectMenuBump: () => void;
  onMultiMenuSelect: (id: BundleMultiMenuActionId) => void;
  onExport: () => void;
};

export function BundlesListBulkBar({
  bulkSelectMenuKey,
  bulkToolbarDisabled,
  totalCount,
  effectiveSelectionCount,
  bulkSelectionMode,
  headerChecked,
  headerIndeterminate,
  onSelectPage,
  onSelectFiltered,
  onClearSelection,
  onSelectMenuBump,
  onMultiMenuSelect,
  onExport,
}: BundlesListBulkBarProps) {
  return (
    <ModuleBulkActionsToolbar
      visible
      bulkSelectMenuKey={bulkSelectMenuKey}
      selectDisabled={bulkToolbarDisabled}
      selectAriaLabel="Zakres zaznaczenia na liście zestawów"
      showFilteredOption
      filteredTotalCount={totalCount}
      onSelectPage={onSelectPage}
      onSelectFiltered={onSelectFiltered}
      onClearSelection={onClearSelection}
      onSelectMenuBump={onSelectMenuBump}
      effectiveSelectionCount={effectiveSelectionCount}
      bulkSelectionMode={bulkSelectionMode}
      headerChecked={headerChecked}
      headerIndeterminate={headerIndeterminate}
      primaryActions={<BundleListMultiActionsMenu disabled={bulkToolbarDisabled} onSelect={onMultiMenuSelect} />}
      showOrBeforeIcons={false}
      iconActions={
        <button
          type="button"
          disabled={bulkToolbarDisabled}
          className={moduleBulkIconBtnClass}
          title="Eksportuj"
          aria-label="Eksportuj"
          onClick={onExport}
        >
          <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      }
      secondaryActions={
        <button
          type="button"
          disabled={bulkToolbarDisabled}
          className={moduleBulkTextBtnClass}
          onClick={() => {
            onClearSelection();
            onSelectMenuBump();
          }}
        >
          Odznacz
        </button>
      }
    />
  );
}
