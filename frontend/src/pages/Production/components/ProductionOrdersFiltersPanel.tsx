import {
  FilterActionsBar,
  ListFilterEmbeddedShell,
  filterGridColsClass,
  filterInputClass,
  filterLabelClass,
  filterSelectClass,
} from "@/components/filters";
import type { ProductionOrdersListFilters } from "@/modules/production/productionListFilters";
import {
  PRODUCTION_ORDER_STATUS_OPTIONS,
  PRODUCTION_PRIORITY_OPTIONS,
} from "@/modules/production/productionListFilters";

type Props = {
  expanded: boolean;
  draft: ProductionOrdersListFilters;
  onChange: (next: ProductionOrdersListFilters) => void;
  onApply: () => void;
  onClear: () => void;
};

export function ProductionOrdersFiltersPanel({ expanded, draft, onChange, onApply, onClear }: Props) {
  return (
    <ListFilterEmbeddedShell expanded={expanded}>
      <div className={filterGridColsClass}>
        <label className="block min-w-0">
          <span className={filterLabelClass}>Szukaj</span>
          <input
            type="search"
            className={filterInputClass}
            placeholder="Numer, produkt…"
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
            {PRODUCTION_ORDER_STATUS_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className={filterLabelClass}>Operator</span>
          <input
            type="text"
            className={filterInputClass}
            value={draft.operator}
            onChange={(e) => onChange({ ...draft, operator: e.target.value })}
          />
        </label>
        <label className="block min-w-0">
          <span className={filterLabelClass}>Produkt</span>
          <input
            type="text"
            className={filterInputClass}
            value={draft.product}
            onChange={(e) => onChange({ ...draft, product: e.target.value })}
          />
        </label>
        <label className="block min-w-0">
          <span className={filterLabelClass}>Data plan. od</span>
          <input
            type="date"
            className={filterInputClass}
            value={draft.plannedFrom}
            onChange={(e) => onChange({ ...draft, plannedFrom: e.target.value })}
          />
        </label>
        <label className="block min-w-0">
          <span className={filterLabelClass}>Data plan. do</span>
          <input
            type="date"
            className={filterInputClass}
            value={draft.plannedTo}
            onChange={(e) => onChange({ ...draft, plannedTo: e.target.value })}
          />
        </label>
        <label className="block min-w-0">
          <span className={filterLabelClass}>Priorytet</span>
          <select
            className={filterSelectClass}
            value={draft.priority}
            onChange={(e) => onChange({ ...draft, priority: e.target.value })}
          >
            {PRODUCTION_PRIORITY_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-[2.25rem] items-end gap-2 pb-1">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={draft.shortagesOnly}
            onChange={(e) => onChange({ ...draft, shortagesOnly: e.target.checked })}
          />
          <span className="text-sm text-slate-700">Tylko braki materiałów</span>
        </label>
      </div>
      <FilterActionsBar onApply={onApply} onClear={onClear} applyLabel="Filtruj" />
    </ListFilterEmbeddedShell>
  );
}
