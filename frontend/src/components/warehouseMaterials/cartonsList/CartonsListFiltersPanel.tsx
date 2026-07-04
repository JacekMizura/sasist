import {
  FilterField,
  FilterGrid,
  FilterPanelBodyWithActions,
  ListFilterEmbeddedShell,
  filterInputClass,
  filterSelectClass,
} from "../../filters";
import { listSellasistFilterGridClass4 } from "../../listPage/listSellasistTokens";
import type { ListViewActionsBinding } from "../../../preferences/listView/listViewActionsTypes";
import type { AppliedCartonsListFilters } from "./cartonsListFilterTypes";

type Props = {
  expanded: boolean;
  draft: AppliedCartonsListFilters;
  onChangeDraft: (patch: Partial<AppliedCartonsListFilters>) => void;
  onApply: () => void;
  onClear: () => void;
  listView?: ListViewActionsBinding;
};

export function CartonsListFiltersPanel({
  expanded,
  draft,
  onChangeDraft,
  onApply,
  onClear,
  listView,
}: Props) {
  return (
    <ListFilterEmbeddedShell expanded={expanded} className="mb-4">
      <FilterPanelBodyWithActions
        onClear={onClear}
        onApply={onApply}
        clearLabel="Wyczyść filtry"
        applyLabel="Filtruj"
        footerMobileOnly={false}
        listView={listView}
      >
        <FilterGrid columnsClassName={listSellasistFilterGridClass4}>
          <FilterField label="Szukaj">
            <input
              className={filterInputClass}
              value={draft.search}
              onChange={(e) => onChangeDraft({ search: e.target.value })}
              placeholder="Nazwa lub SKU…"
            />
          </FilterField>
          <FilterField label="Status">
            <select
              className={filterSelectClass}
              value={draft.status}
              onChange={(e) => onChangeDraft({ status: e.target.value as AppliedCartonsListFilters["status"] })}
            >
              <option value="all">Wszystkie</option>
              <option value="active">Aktywne</option>
              <option value="inactive">Nieaktywne</option>
            </select>
          </FilterField>
          <FilterField label="Sortowanie">
            <select
              className={filterSelectClass}
              value={draft.sort}
              onChange={(e) => onChangeDraft({ sort: e.target.value as AppliedCartonsListFilters["sort"] })}
            >
              <option value="name">Nazwa A–Z</option>
              <option value="stock">Stan malejąco</option>
              <option value="net">Cena netto / szt.</option>
            </select>
          </FilterField>
        </FilterGrid>
      </FilterPanelBodyWithActions>
    </ListFilterEmbeddedShell>
  );
}
