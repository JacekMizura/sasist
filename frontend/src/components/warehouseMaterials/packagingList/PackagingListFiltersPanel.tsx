import {
  FilterField,
  FilterGrid,
  FilterPanelBodyWithActions,
  ListFilterEmbeddedShell,
  filterCheckboxClass,
  filterInputClass,
  filterSelectClass,
} from "../../filters";
import { listSellasistFilterGridClass4 } from "../../listPage/listSellasistTokens";
import type { ListViewActionsBinding } from "../../../preferences/listView/listViewActionsTypes";
import type { AppliedPackagingListFilters } from "./packagingListFilterTypes";
import { PACKAGING_TYPE_LABELS } from "./packagingListFilterTypes";

type Props = {
  expanded: boolean;
  draft: AppliedPackagingListFilters;
  suppliers: { id: number; name: string }[];
  onChangeDraft: (patch: Partial<AppliedPackagingListFilters>) => void;
  onApply: () => void;
  onClear: () => void;
  listView?: ListViewActionsBinding;
};

export function PackagingListFiltersPanel({
  expanded,
  draft,
  suppliers,
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
          <FilterField label="Typ materiału">
            <select
              className={filterSelectClass}
              value={draft.materialType}
              onChange={(e) => onChangeDraft({ materialType: e.target.value })}
            >
              <option value="">Wszystkie</option>
              {Object.entries(PACKAGING_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Dostawca">
            <select
              className={filterSelectClass}
              value={draft.supplierId}
              onChange={(e) => onChangeDraft({ supplierId: e.target.value })}
            >
              <option value="">Wszyscy</option>
              {suppliers.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Status">
            <select
              className={filterSelectClass}
              value={draft.status}
              onChange={(e) => onChangeDraft({ status: e.target.value as AppliedPackagingListFilters["status"] })}
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
              onChange={(e) => onChangeDraft({ sort: e.target.value as AppliedPackagingListFilters["sort"] })}
            >
              <option value="name">Nazwa A–Z</option>
              <option value="stock">Stan malejąco</option>
              <option value="supplier">Dostawca A–Z</option>
              <option value="net">Cena netto / j.u.</option>
            </select>
          </FilterField>
        </FilterGrid>
        <label className="mt-1 inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className={filterCheckboxClass}
            checked={draft.lowStockOnly}
            onChange={(e) => onChangeDraft({ lowStockOnly: e.target.checked })}
          />
          Tylko niski stan
        </label>
      </FilterPanelBodyWithActions>
    </ListFilterEmbeddedShell>
  );
}
