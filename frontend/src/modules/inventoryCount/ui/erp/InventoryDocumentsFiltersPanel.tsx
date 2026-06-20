import {
  FilterActionsBar,
  ListFilterEmbeddedShell,
  filterGridColsClass,
  filterInputClass,
  filterLabelClass,
  filterSelectClass,
} from "@/components/filters";
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
};

export function InventoryDocumentsFiltersPanel({ expanded, draft, onChange, onApply, onClear }: Props) {
  return (
    <ListFilterEmbeddedShell expanded={expanded}>
      <div className={filterGridColsClass}>
        <label className="block min-w-0">
          <span className={filterLabelClass}>Szukaj</span>
          <input
            type="search"
            className={filterInputClass}
            placeholder="Numer, tytuł…"
            value={draft.query}
            onChange={(e) => onChange({ ...draft, query: e.target.value })}
          />
        </label>
        <label className="block min-w-0">
          <span className={filterLabelClass}>Status</span>
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
        </label>
        <label className="block min-w-0">
          <span className={filterLabelClass}>Typ</span>
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
        </label>
      </div>
      <FilterActionsBar onApply={onApply} onClear={onClear} applyLabel="Filtruj" />
    </ListFilterEmbeddedShell>
  );
}
