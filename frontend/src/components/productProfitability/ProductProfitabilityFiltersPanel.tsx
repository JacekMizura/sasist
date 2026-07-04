import {
  FilterField,
  FilterGrid,
  FilterPanelBodyWithActions,
  ListFilterEmbeddedShell,
  filterCheckboxClass,
  filterSelectClass,
} from "../filters";
import { listSellasistFilterGridClass4 } from "../listPage/listSellasistTokens";
import type { ListViewActionsBinding } from "../../preferences/listView/listViewActionsTypes";
import type { AppliedProductProfitabilityFilters } from "./productProfitabilityFilterTypes";

const RANGE_OPTIONS = [
  { value: 1, label: "Dzisiaj" },
  { value: 7, label: "7 dni" },
  { value: 30, label: "30 dni" },
  { value: 90, label: "90 dni" },
  { value: 365, label: "365 dni" },
] as const;

const SORT_OPTIONS = [
  { value: "lowest_profit", label: "Najniższy zysk" },
  { value: "highest_profit", label: "Najwyższy zysk" },
  { value: "highest_revenue", label: "Najwyższy przychód" },
  { value: "highest_frozen_capital", label: "Najwyższy zamrożony kapitał" },
  { value: "worst_margin", label: "Najgorsza marża" },
  { value: "best_margin", label: "Najlepsza marża" },
] as const;

type Props = {
  expanded: boolean;
  draft: AppliedProductProfitabilityFilters;
  onChangeDraft: (patch: Partial<AppliedProductProfitabilityFilters>) => void;
  onApply: () => void;
  onClear: () => void;
  listView?: ListViewActionsBinding;
};

export function ProductProfitabilityFiltersPanel({
  expanded,
  draft,
  onChangeDraft,
  onApply,
  onClear,
  listView,
}: Props) {
  return (
    <ListFilterEmbeddedShell expanded={expanded}>
      <FilterPanelBodyWithActions
        onClear={onClear}
        onApply={onApply}
        clearLabel="Wyczyść filtry"
        applyLabel="Filtruj"
        footerMobileOnly={false}
        listView={listView}
      >
        <div className="space-y-2">
          <FilterGrid columnsClassName={listSellasistFilterGridClass4}>
            <FilterField label="Zakres czasu">
              <select
                className={filterSelectClass}
                value={draft.rangeDays}
                onChange={(e) => onChangeDraft({ rangeDays: Number(e.target.value) })}
              >
                {RANGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Sortowanie">
              <select
                className={filterSelectClass}
                value={draft.sort}
                onChange={(e) => onChangeDraft({ sort: e.target.value })}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FilterField>
          </FilterGrid>
          <div className="flex flex-wrap gap-x-5 gap-y-3 border-t border-slate-100 pt-4 text-sm text-slate-700">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className={filterCheckboxClass}
                checked={draft.onlyLoss}
                onChange={(e) => onChangeDraft({ onlyLoss: e.target.checked })}
              />
              Tylko strata
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className={filterCheckboxClass}
                checked={draft.onlyLowMargin}
                onChange={(e) => onChangeDraft({ onlyLowMargin: e.target.checked })}
              />
              Tylko niska marża
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className={filterCheckboxClass}
                checked={draft.onlyNoSales}
                onChange={(e) => onChangeDraft({ onlyNoSales: e.target.checked })}
              />
              Tylko bez sprzedaży
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className={filterCheckboxClass}
                checked={draft.onlyTopProfit}
                onChange={(e) => onChangeDraft({ onlyTopProfit: e.target.checked })}
              />
              Tylko top zysk
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className={filterCheckboxClass}
                checked={draft.onlyHighStock}
                onChange={(e) => onChangeDraft({ onlyHighStock: e.target.checked })}
              />
              Tylko wysoki stan
            </label>
          </div>
        </div>
      </FilterPanelBodyWithActions>
    </ListFilterEmbeddedShell>
  );
}
