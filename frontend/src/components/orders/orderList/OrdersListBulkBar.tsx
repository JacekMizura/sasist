import { Download, Mail, Printer } from "lucide-react";

import { PanelBulkStatusPickerDropdown } from "../../panel/PanelBulkStatusPickerDropdown";
import type { PanelBulkSelectionMode } from "../../../hooks/usePanelListBulkSelection";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import {
  ModuleBulkActionsToolbar,
  moduleBulkIconBtnClass,
  moduleBulkOrSeparatorClass,
  moduleBulkTextBtnClass,
} from "../../listPage/moduleList";
import { OrderListMultiActionsMenu, type MultiMenuActionId } from "./OrderListMultiActionsMenu";
import type { OrderQuickToolbarActionKind } from "./orderQuickActionKinds";

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
  onMultiMenuSelect: (id: MultiMenuActionId) => void;
  onQuickAction: (kind: OrderQuickToolbarActionKind) => void;
  onExport: () => void;
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
  onMultiMenuSelect,
  onQuickAction,
  onExport,
}: OrdersListBulkBarProps) {
  return (
    <ModuleBulkActionsToolbar
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
      primaryActions={
        <>
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
          <span className={moduleBulkOrSeparatorClass}>lub</span>
          <OrderListMultiActionsMenu disabled={bulkBusy} onSelect={onMultiMenuSelect} />
        </>
      }
      iconActions={
        <>
          <button
            type="button"
            disabled={bulkToolbarDisabled}
            className={moduleBulkIconBtnClass}
            title="Wystaw dokument"
            aria-label="Wystaw dokument"
            onClick={() => onQuickAction("issue_document")}
          >
            <Printer className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            disabled={bulkToolbarDisabled}
            className={moduleBulkIconBtnClass}
            title="Wyślij wiadomość"
            aria-label="Wyślij wiadomość"
            onClick={() => onQuickAction("send_message")}
          >
            <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
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
        </>
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
