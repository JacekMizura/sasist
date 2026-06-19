import { PanelBulkStatusPickerDropdown } from "../../panel/PanelBulkStatusPickerDropdown";
import type { PanelBulkSelectionMode } from "../../../hooks/usePanelListBulkSelection";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import { ModuleListBulkBar } from "../../listPage/moduleList";

export type OrdersListBulkBarProps = {
  bulkSelectMenuKey: number;
  bulkBusy: boolean;
  bulkToolbarDisabled: boolean;
  totalCount: number;
  effectiveSelectionCount: number;
  bulkSelectionMode: PanelBulkSelectionMode;
  headerChecked: boolean;
  headerIndeterminate: boolean;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[] | null;
  onSelectPage: () => void;
  onSelectFiltered: () => void;
  onClearSelection: () => void;
  onSelectMenuBump: () => void;
  onBulkStatusSelect: (statusId: string) => void;
};

export function OrdersListBulkBar({
  bulkSelectMenuKey,
  bulkBusy,
  bulkToolbarDisabled,
  totalCount,
  effectiveSelectionCount,
  bulkSelectionMode,
  headerChecked,
  headerIndeterminate,
  panelSummary,
  panelSubgroups,
  onSelectPage,
  onSelectFiltered,
  onClearSelection,
  onSelectMenuBump,
  onBulkStatusSelect,
}: OrdersListBulkBarProps) {
  return (
    <ModuleListBulkBar
      bulkSelectMenuKey={bulkSelectMenuKey}
      selectDisabled={bulkBusy}
      selectAriaLabel="Zakres zaznaczenia na liście zamówień"
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
      clearDisabled={bulkToolbarDisabled}
      actionSlot={
        <PanelBulkStatusPickerDropdown
          key={`${bulkSelectMenuKey}-st`}
          panelSummary={panelSummary}
          panelSubgroups={panelSubgroups}
          disabled={bulkToolbarDisabled}
          placeholder="Wybierz akcję"
          ariaLabel="Zmień status panelu dla zaznaczonych zamówień"
          onSelect={(v) => {
            if (effectiveSelectionCount === 0) return;
            onBulkStatusSelect(v);
          }}
        />
      }
    />
  );
}
