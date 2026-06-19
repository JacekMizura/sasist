import {
  Download,
  Flag,
  Mail,
  Package,
  Printer,
  RefreshCw,
  Truck,
} from "lucide-react";
import { Link } from "react-router-dom";

import type { PanelBulkSelectionMode } from "../../../hooks/usePanelListBulkSelection";
import {
  ModuleBulkActionsToolbar,
  moduleBulkIconBtnClass,
  moduleBulkOrSeparatorClass,
  moduleBulkTextBtnClass,
} from "../../listPage/moduleList";
import { listSellasistInputClass } from "../../listPage/listSellasistTokens";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";
import { OrderListMultiActionsMenu, type MultiMenuActionId } from "./OrderListMultiActionsMenu";

export type OrdersListBulkBarProps = {
  bulkSelectMenuKey: number;
  bulkBusy: boolean;
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
  onMultiMenuSelect: (id: MultiMenuActionId) => void;
  onQuickAction: (kind: import("./orderQuickActionKinds").OrderQuickToolbarActionKind) => void;
  onOpenMultiModal: () => void;
  onRefresh: () => void;
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
  onSelectPage,
  onSelectFiltered,
  onClearSelection,
  onSelectMenuBump,
  onMultiMenuSelect,
  onQuickAction,
  onOpenMultiModal,
  onRefresh,
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
          <select
            disabled={bulkToolbarDisabled}
            aria-label="Wybierz akcję zbiorczą"
            className={`${listSellasistInputClass} !h-9 max-w-[14rem] shrink-0 text-sm ${bulkToolbarDisabled ? "opacity-50" : ""}`}
            defaultValue=""
            onChange={() => undefined}
          >
            <option value="">Wybierz akcję</option>
          </select>
          <button
            type="button"
            disabled={bulkToolbarDisabled}
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-40"
          >
            Wykonaj
          </button>
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
            title="Zmień status"
            aria-label="Zmień status"
            onClick={() => onQuickAction("change_status")}
          >
            <Flag className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
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
            title="Metoda wysyłki — multiakcje"
            aria-label="Metoda wysyłki"
            onClick={onOpenMultiModal}
          >
            <Truck className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            disabled={bulkToolbarDisabled}
            className={moduleBulkIconBtnClass}
            title="Wiadomość"
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
          <button
            type="button"
            disabled={bulkBusy}
            className={moduleBulkIconBtnClass}
            title="Odśwież"
            aria-label="Odśwież listę"
            onClick={onRefresh}
          >
            <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          <Link
            to={WMS_ROUTES.packing}
            className={`${moduleBulkIconBtnClass} no-underline`}
            title="Pakowanie WMS"
            aria-label="Pakowanie WMS"
          >
            <Package className="h-4 w-4" strokeWidth={2} aria-hidden />
          </Link>
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
