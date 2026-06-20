import { filterCheckboxClass } from "../../../components/filters";
import {
  PurchasingFilterBar,
  PurchasingFilterField,
  purchasingFilterButtonClass,
  purchasingFilterPrimaryButtonClass,
  purchasingInputClass,
  purchasingSelectClass,
} from "../../../modules/purchasing/ui";
import type { AppliedPackagingListFilters } from "./packagingListFilterTypes";
import { PACKAGING_TYPE_LABELS } from "./packagingListFilterTypes";

type Props = {
  expanded: boolean;
  draft: AppliedPackagingListFilters;
  suppliers: { id: number; name: string }[];
  onChangeDraft: (patch: Partial<AppliedPackagingListFilters>) => void;
  onApply: () => void;
  onClear: () => void;
};

export function PackagingListFiltersPanel({ expanded, draft, suppliers, onChangeDraft, onApply, onClear }: Props) {
  if (!expanded) return null;

  return (
    <PurchasingFilterBar
      className="mb-4"
      actions={
        <>
          <button type="button" className={purchasingFilterButtonClass} onClick={onClear}>
            Wyczyść filtry
          </button>
          <button type="button" className={purchasingFilterPrimaryButtonClass} onClick={onApply}>
            Filtruj
          </button>
        </>
      }
    >
      <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <PurchasingFilterField label="Szukaj" className="min-w-0">
          <input
            className={purchasingInputClass}
            value={draft.search}
            onChange={(e) => onChangeDraft({ search: e.target.value })}
            placeholder="Nazwa lub SKU…"
          />
        </PurchasingFilterField>
        <PurchasingFilterField label="Typ materiału" className="min-w-0">
          <select
            className={purchasingSelectClass}
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
        </PurchasingFilterField>
        <PurchasingFilterField label="Dostawca" className="min-w-0">
          <select
            className={purchasingSelectClass}
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
        </PurchasingFilterField>
        <PurchasingFilterField label="Status" className="min-w-0">
          <select
            className={purchasingSelectClass}
            value={draft.status}
            onChange={(e) => onChangeDraft({ status: e.target.value as AppliedPackagingListFilters["status"] })}
          >
            <option value="all">Wszystkie</option>
            <option value="active">Aktywne</option>
            <option value="inactive">Nieaktywne</option>
          </select>
        </PurchasingFilterField>
        <PurchasingFilterField label="Sortowanie" className="min-w-0">
          <select
            className={purchasingSelectClass}
            value={draft.sort}
            onChange={(e) => onChangeDraft({ sort: e.target.value as AppliedPackagingListFilters["sort"] })}
          >
            <option value="name">Nazwa A–Z</option>
            <option value="stock">Stan malejąco</option>
            <option value="supplier">Dostawca A–Z</option>
            <option value="net">Cena netto / j.u.</option>
          </select>
        </PurchasingFilterField>
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className={filterCheckboxClass}
          checked={draft.lowStockOnly}
          onChange={(e) => onChangeDraft({ lowStockOnly: e.target.checked })}
        />
        Tylko niski stan
      </label>
    </PurchasingFilterBar>
  );
}
