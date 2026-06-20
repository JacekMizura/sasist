import {
  PurchasingFilterBar,
  PurchasingFilterField,
  purchasingFilterButtonClass,
  purchasingFilterPrimaryButtonClass,
  purchasingInputClass,
  purchasingSelectClass,
} from "../../../modules/purchasing/ui";
import type { AppliedCartonsListFilters } from "./cartonsListFilterTypes";

type Props = {
  expanded: boolean;
  draft: AppliedCartonsListFilters;
  onChangeDraft: (patch: Partial<AppliedCartonsListFilters>) => void;
  onApply: () => void;
  onClear: () => void;
};

export function CartonsListFiltersPanel({ expanded, draft, onChangeDraft, onApply, onClear }: Props) {
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
        <PurchasingFilterField label="Szukaj" className="min-w-0 sm:col-span-2 lg:col-span-1">
          <input
            className={purchasingInputClass}
            value={draft.search}
            onChange={(e) => onChangeDraft({ search: e.target.value })}
            placeholder="Nazwa lub SKU…"
          />
        </PurchasingFilterField>
        <PurchasingFilterField label="Status" className="min-w-0">
          <select
            className={purchasingSelectClass}
            value={draft.status}
            onChange={(e) => onChangeDraft({ status: e.target.value as AppliedCartonsListFilters["status"] })}
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
            onChange={(e) => onChangeDraft({ sort: e.target.value as AppliedCartonsListFilters["sort"] })}
          >
            <option value="name">Nazwa A–Z</option>
            <option value="stock">Stan malejąco</option>
            <option value="net">Cena netto / szt.</option>
          </select>
        </PurchasingFilterField>
      </div>
    </PurchasingFilterBar>
  );
}
