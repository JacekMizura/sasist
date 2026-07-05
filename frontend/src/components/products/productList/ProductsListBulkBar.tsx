import type { ReactNode } from "react";
import { Download, Mail, Printer } from "lucide-react";

import type { PanelBulkSelectionMode } from "../../../hooks/usePanelListBulkSelection";
import type { ProductBulkHubChoice } from "../../../pages/Products/productBulkHubTypes";
import {
  ModuleBulkActionsToolbar,
  moduleBulkIconBtnClass,
  moduleBulkOrSeparatorClass,
  moduleBulkTextBtnClass,
} from "../../listPage/moduleList";
import { ProductListBulkActionPicker, ProductListMutationsMenu } from "./ProductListBulkMenus";

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
  onBulkActionSelect: (action: ProductBulkHubChoice) => void;
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
  onBulkActionSelect,
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
        <>
          <ProductListBulkActionPicker
            selectKey={bulkSelectMenuKey}
            disabled={bulkToolbarDisabled}
            onSelect={onBulkActionSelect}
          />
          <span className={moduleBulkOrSeparatorClass}>lub</span>
          <ProductListMutationsMenu disabled={bulkToolbarDisabled} onSelect={onBulkActionSelect} />
        </>
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
      trailing={trailing}
    />
  );
}
