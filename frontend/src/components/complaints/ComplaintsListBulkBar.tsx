import { PanelBulkStatusPickerDropdown } from "../panel/PanelBulkStatusPickerDropdown";
import type { PanelBulkSelectionMode } from "../../hooks/usePanelListBulkSelection";
import { ModuleListBulkBar } from "../listPage/moduleList";

export type ComplaintsListBulkBarProps = {
  bulkSelectMenuKey: number;
  filteredTotalCount: number;
  effectiveSelectionCount: number;
  bulkSelectionMode: PanelBulkSelectionMode;
  headerChecked: boolean;
  headerIndeterminate: boolean;
  selectionToolbarDisabled: boolean;
  onSelectPage: () => void;
  onSelectFiltered: () => void;
  onClearSelection: () => void;
  onSelectMenuBump: () => void;
};

export function ComplaintsListBulkBar({
  bulkSelectMenuKey,
  filteredTotalCount,
  effectiveSelectionCount,
  bulkSelectionMode,
  headerChecked,
  headerIndeterminate,
  selectionToolbarDisabled,
  onSelectPage,
  onSelectFiltered,
  onClearSelection,
  onSelectMenuBump,
}: ComplaintsListBulkBarProps) {
  return (
    <ModuleListBulkBar
      bulkSelectMenuKey={bulkSelectMenuKey}
      selectAriaLabel="Opcje zaznaczania listy reklamacji"
      showFilteredOption
      filteredTotalCount={filteredTotalCount}
      onSelectPage={onSelectPage}
      onSelectFiltered={onSelectFiltered}
      onClearSelection={onClearSelection}
      onSelectMenuBump={onSelectMenuBump}
      effectiveSelectionCount={effectiveSelectionCount}
      bulkSelectionMode={bulkSelectionMode}
      headerChecked={headerChecked}
      headerIndeterminate={headerIndeterminate}
      clearDisabled={selectionToolbarDisabled}
      showDelete
      deleteDisabled
      deleteTitle="Usuń — tylko pojedynczo z wiersza"
      actionSlot={
        <PanelBulkStatusPickerDropdown
          key={`${bulkSelectMenuKey}-st`}
          panelSummary={null}
          disabled
          placeholder="Wybierz akcję"
          ariaLabel="Zmień status panelu dla zaznaczonych reklamacji"
          onSelect={() => undefined}
        />
      }
    />
  );
}
