import type { ReactNode } from "react";
import { Zap } from "lucide-react";

import type { PanelBulkSelectionMode } from "../../../hooks/usePanelListBulkSelection";
import {
  ModuleBulkActionsToolbar,
  moduleBulkIconBtnClass,
  moduleBulkTextBtnClass,
} from "../../listPage/moduleList";
import { Download, Mail, Printer } from "lucide-react";

export type ProductsListBulkBarProps = {
  bulkSelectMenuKey: number;
  bulkToolbarDisabled: boolean;
  filteredSelectDisabled?: boolean;
  totalCount: number;
  effectiveSelectionCount: number;
  bulkSelectionMode: PanelBulkSelectionMode;
  headerChecked: boolean;
  headerIndeterminate: boolean;
  onSelectPage: () => void;
  onSelectFiltered: () => void;
  onClearSelection: () => void;
  onSelectMenuBump: () => void;
  onOpenMultiActions: () => void;
  onDelete: () => void;
  onPrint: () => void;
  onExport: () => void;
  trailing?: ReactNode;
};

export function ProductsListBulkBar({
  bulkSelectMenuKey,
  bulkToolbarDisabled,
  filteredSelectDisabled = false,
  totalCount,
  effectiveSelectionCount,
  bulkSelectionMode,
  headerChecked,
  headerIndeterminate,
  onSelectPage,
  onSelectFiltered,
  onClearSelection,
  onSelectMenuBump,
  onOpenMultiActions,
  onDelete,
  onPrint,
  onExport,
  trailing,
}: ProductsListBulkBarProps) {
  return (
    <ModuleBulkActionsToolbar
      visible
      bulkSelectMenuKey={bulkSelectMenuKey}
      selectDisabled={bulkToolbarDisabled}
      selectAriaLabel="Zakres zaznaczenia na liście produktów"
      showFilteredOption={!filteredSelectDisabled}
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
        <button
          type="button"
          disabled={bulkToolbarDisabled}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 shadow-none transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
          aria-label="Multiakcje"
          onClick={onOpenMultiActions}
        >
          <Zap className="h-3.5 w-3.5 text-amber-500" strokeWidth={2} aria-hidden />
          Multiakcje
        </button>
      }
      iconActions={
        <>
          <button
            type="button"
            disabled={bulkToolbarDisabled}
            className={moduleBulkIconBtnClass}
            title="Drukuj karty produktów (DTE)"
            aria-label="Drukuj karty produktów"
            onClick={onPrint}
          >
            <Printer className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            disabled
            className={`${moduleBulkIconBtnClass} opacity-40`}
            title="Wkrótce"
            aria-label="E-mail"
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
        <>
          <button
            type="button"
            disabled={bulkToolbarDisabled}
            className={moduleBulkTextBtnClass}
            onClick={onDelete}
          >
            Usuń
          </button>
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
        </>
      }
      trailing={trailing}
    />
  );
}
