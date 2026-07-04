import {
  FilterField,
  FilterGrid,
  FilterNumberRange,
  FilterPanelBodyWithActions,
  ListFilterEmbeddedShell,
  filterInputClass,
  filterSelectClass,
  useFilterFieldOrder,
  type FilterFieldCatalogItem,
} from "../../filters";
import { listSellasistFilterGridClass4 } from "../../listPage/listSellasistTokens";
import type { ListViewActionsBinding } from "../../../preferences/listView/listViewActionsTypes";
import type { AppliedBundleListFilters } from "./bundleListFilterTypes";

const BUNDLE_LIST_FILTER_STORAGE_KEY = "bundles.list.v2";

export const BUNDLE_LIST_FILTER_CATALOG: FilterFieldCatalogItem[] = [
  { id: "name", label: "Nazwa" },
  { id: "ean_sku", label: "EAN / SKU" },
  { id: "stock_range", label: "Stan zestawu" },
  { id: "price_range", label: "Cena (zł)" },
  { id: "status", label: "Status" },
];

export const BUNDLE_LIST_FILTER_IDS = BUNDLE_LIST_FILTER_CATALOG.map((c) => c.id);

export type BundlesListFiltersPanelProps = {
  expanded: boolean;
  draft: AppliedBundleListFilters;
  onChangeDraft: (patch: Partial<AppliedBundleListFilters>) => void;
  onApply: () => void;
  onClear: () => void;
  listView?: ListViewActionsBinding;
  filterFieldOrder?: string[];
  onFilterFieldOrderSave?: (order: string[]) => void;
};

export function BundlesListFiltersPanel({
  expanded,
  draft,
  onChangeDraft,
  onApply,
  onClear,
  listView,
  filterFieldOrder: filterFieldOrderProp,
  onFilterFieldOrderSave,
}: BundlesListFiltersPanelProps) {
  const controlledFieldOrder =
    filterFieldOrderProp && onFilterFieldOrderSave
      ? { order: filterFieldOrderProp, onChange: onFilterFieldOrderSave }
      : undefined;
  const { order: visibleOrder } = useFilterFieldOrder(
    BUNDLE_LIST_FILTER_STORAGE_KEY,
    BUNDLE_LIST_FILTER_IDS,
    undefined,
    controlledFieldOrder,
  );

  const renderField = (fieldId: string) => {
    switch (fieldId) {
      case "name":
        return (
          <FilterField key={fieldId} label="Nazwa">
            <input
              type="text"
              className={filterInputClass}
              value={draft.name}
              onChange={(e) => onChangeDraft({ name: e.target.value })}
              placeholder="Szukaj po nazwie…"
            />
          </FilterField>
        );
      case "ean_sku":
        return (
          <FilterField key={fieldId} label="EAN / SKU">
            <input
              type="text"
              className={filterInputClass}
              value={draft.eanSku}
              onChange={(e) => onChangeDraft({ eanSku: e.target.value })}
              placeholder="EAN lub SKU…"
            />
          </FilterField>
        );
      case "stock_range":
        return (
          <FilterNumberRange
            key={fieldId}
            label="Stan zestawu"
            min={draft.stockMin}
            max={draft.stockMax}
            onMinChange={(v) => onChangeDraft({ stockMin: v })}
            onMaxChange={(v) => onChangeDraft({ stockMax: v })}
          />
        );
      case "price_range":
        return (
          <FilterNumberRange
            key={fieldId}
            label="Cena (zł)"
            min={draft.priceMin}
            max={draft.priceMax}
            onMinChange={(v) => onChangeDraft({ priceMin: v })}
            onMaxChange={(v) => onChangeDraft({ priceMax: v })}
            step={0.01}
          />
        );
      case "status":
        return (
          <FilterField key={fieldId} label="Status">
            <select
              className={filterSelectClass}
              value={draft.status}
              onChange={(e) =>
                onChangeDraft({ status: e.target.value as AppliedBundleListFilters["status"] })
              }
            >
              <option value="all">Wszystkie</option>
              <option value="active">Aktywne</option>
              <option value="inactive">Nieaktywne</option>
            </select>
          </FilterField>
        );
      default:
        return null;
    }
  };

  const orderedNodes = visibleOrder.map((id) => renderField(id)).filter(Boolean);

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
        <FilterGrid columnsClassName={listSellasistFilterGridClass4}>{orderedNodes}</FilterGrid>
      </FilterPanelBodyWithActions>
    </ListFilterEmbeddedShell>
  );
}
