import {
  FilterField,
  FilterGrid,
  FilterPanelBodyWithActions,
  ListFilterEmbeddedShell,
  filterInputClass,
  filterSelectClass,
} from "@/components/filters";
import { listSellasistFilterGridClass4 } from "@/components/listPage/listSellasistTokens";
import type { ListViewActionsBinding } from "@/preferences/listView/listViewActionsTypes";
import type { InventoryDocumentListFilters } from "../../inventoryCountDocumentListFilters";
import {
  INVENTORY_DOCUMENT_STATUS_FILTER_OPTIONS,
  INVENTORY_DOCUMENT_TYPE_FILTER_OPTIONS,
} from "../../inventoryCountDocumentListFilters";

type Props = {
  expanded: boolean;
  draft: InventoryDocumentListFilters;
  onChange: (next: InventoryDocumentListFilters) => void;
  onApply: () => void;
  onClear: () => void;
  listView?: ListViewActionsBinding;
};

export function InventoryDocumentsFiltersPanel({
  expanded,
  draft,
  onChange,
  onApply,
  onClear,
  listView,
}: Props) {
  return (
    <ListFilterEmbeddedShell expanded={expanded}>
      <FilterPanelBodyWithActions
        onClear={onClear}
        onApply={onApply}
        applyLabel="Filtruj"
        clearLabel="Wyczyść filtry"
        footerMobileOnly={false}
        listView={listView}
      >
        <FilterGrid columnsClassName={listSellasistFilterGridClass4}>
          <FilterField label="Szukaj">
            <input
              type="search"
              className={filterInputClass}
              placeholder="Numer, tytuł…"
              value={draft.query}
              onChange={(e) => onChange({ ...draft, query: e.target.value })}
            />
          </FilterField>
          <FilterField label="Status">
            <select
              className={filterSelectClass}
              value={draft.status}
              onChange={(e) => onChange({ ...draft, status: e.target.value })}
            >
              {INVENTORY_DOCUMENT_STATUS_FILTER_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Typ">
            <select
              className={filterSelectClass}
              value={draft.type}
              onChange={(e) => onChange({ ...draft, type: e.target.value })}
            >
              {INVENTORY_DOCUMENT_TYPE_FILTER_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FilterField>
        </FilterGrid>
      </FilterPanelBodyWithActions>
    </ListFilterEmbeddedShell>
  );
}
