import {
  Download,
  Flag,
  Mail,
  Package,
  Pin,
  Printer,
  RefreshCw,
  Truck,
  Upload,
} from "lucide-react";
import { Link } from "react-router-dom";

import type { PanelBulkSelectionMode } from "../../hooks/usePanelListBulkSelection";
import {
  ModuleBulkActionsToolbar,
  moduleBulkDangerBtnClass,
  moduleBulkIconBtnClass,
  moduleBulkOrSeparatorClass,
  moduleBulkTextBtnClass,
} from "../listPage/moduleList";
import { listSellasistInputClass } from "../listPage/listSellasistTokens";
import { WMS_ROUTES } from "../../pages/wms/wmsRoutes";

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
  onRefresh: () => void;
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
  onRefresh,
}: ComplaintsListBulkBarProps) {
  return (
    <ModuleBulkActionsToolbar
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
      primaryActions={
        <>
          <select
            disabled
            aria-label="Wybierz akcję zbiorczą"
            className={`${listSellasistInputClass} !h-9 max-w-[14rem] shrink-0 text-sm opacity-50`}
            defaultValue=""
          >
            <option value="">Wybierz akcję</option>
          </select>
          <button
            type="button"
            disabled
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 opacity-40"
          >
            Wykonaj
          </button>
          <span className={moduleBulkOrSeparatorClass}>lub</span>
          <button
            type="button"
            disabled
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 opacity-40"
            title="Wkrótce"
          >
            Wykonaj multiakcje
          </button>
        </>
      }
      iconActions={
        <>
          <button type="button" disabled className={moduleBulkIconBtnClass} title="Wkrótce" aria-label="Zmień status">
            <Flag className="h-4 w-4 opacity-50" strokeWidth={2} aria-hidden />
          </button>
          <button type="button" disabled className={moduleBulkIconBtnClass} title="Wkrótce" aria-label="Eksport">
            <Download className="h-4 w-4 opacity-50" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            className={moduleBulkIconBtnClass}
            title="Odśwież listę"
            aria-label="Odśwież listę"
            onClick={onRefresh}
          >
            <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          <button type="button" disabled className={moduleBulkIconBtnClass} title="Wkrótce" aria-label="Import">
            <Upload className="h-4 w-4 opacity-50" strokeWidth={2} aria-hidden />
          </button>
          <button type="button" disabled className={moduleBulkIconBtnClass} title="Wkrótce" aria-label="Drukuj">
            <Printer className="h-4 w-4 opacity-50" strokeWidth={2} aria-hidden />
          </button>
          <button type="button" disabled className={moduleBulkIconBtnClass} title="Wkrótce" aria-label="Dostawa">
            <Truck className="h-4 w-4 opacity-50" strokeWidth={2} aria-hidden />
          </button>
          <button type="button" disabled className={moduleBulkIconBtnClass} title="Wkrótce" aria-label="Wiadomość">
            <Mail className="h-4 w-4 opacity-50" strokeWidth={2} aria-hidden />
          </button>
          <button type="button" disabled className={moduleBulkIconBtnClass} title="Wkrótce" aria-label="Pin">
            <Pin className="h-4 w-4 opacity-50" strokeWidth={2} aria-hidden />
          </button>
          <Link
            to={WMS_ROUTES.returns}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 shadow-none transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Package className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            WMS
          </Link>
        </>
      }
      secondaryActions={
        <>
          <button
            type="button"
            disabled
            className={`${moduleBulkDangerBtnClass} cursor-not-allowed opacity-40`}
            title="Usuń — tylko pojedynczo z wiersza"
          >
            Usuń
          </button>
          <button
            type="button"
            disabled={selectionToolbarDisabled}
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
