import { useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import {
  FilterField,
  FilterGrid,
  FilterNumberRange,
  FilterPanelBodyWithActions,
  FilterVisibilityModal,
  ListFilterEmbeddedShell,
  useFilterFieldOrder,
  type FilterFieldCatalogItem,
} from "../../components/filters";
import {
  listSellasistFilterGridClass4,
  listSellasistInputClass,
  listSellasistLabelClass,
} from "../../components/listPage/listSellasistTokens";
import type { ProductListUiFilters } from "./productListUiFilters";
import { DEFAULT_PRODUCT_LIST_UI_FILTERS as defaultFilters } from "./productListUiFilters";
import type { ListViewActionsBinding } from "../../preferences/listView/listViewActionsTypes";

type Tenant = { id: number; name: string };

/** v3: waga (od–do) + kolejność pól. */
const STORAGE_KEY = "products.list.v3";

const FILTER_CATALOG: FilterFieldCatalogItem[] = [
  { id: "tenant", label: "Tenant" },
  { id: "name", label: "Nazwa" },
  { id: "ean_sku", label: "EAN / SKU" },
  { id: "stock_range", label: "Stan magazynowy" },
  { id: "price_range", label: "Cena (zł)" },
  { id: "weight_range", label: "Waga (kg)" },
  { id: "producer", label: "Producent" },
  { id: "status", label: "Status (dane)" },
  { id: "has_locations", label: "Lokalizacje fizyczne" },
  { id: "mismatch", label: "Niezgodność plan / stan" },
];

const FILTER_IDS = FILTER_CATALOG.map((c) => c.id);

export type ProductListFiltersSectionProps = {
  expanded: boolean;
  filters: ProductListUiFilters;
  setFilters: Dispatch<SetStateAction<ProductListUiFilters>>;
  tenantFilter: number | null;
  onTenantFilterChange: (next: number | null) => void;
  tenants: Tenant[];
  producerOptions: string[];
  onApply: () => void;
  onClear: () => void;
  clientMode: boolean;
  clientBatchLimit: number;
  openVisibilityRef?: MutableRefObject<(() => void) | null>;
  filterFieldOrder?: string[];
  onFilterFieldOrderSave?: (order: string[]) => void;
  listView?: ListViewActionsBinding;
};

export function ProductListFiltersSection({
  expanded,
  filters,
  setFilters,
  tenantFilter,
  onTenantFilterChange,
  tenants,
  producerOptions,
  onApply,
  onClear,
  clientMode,
  clientBatchLimit,
  openVisibilityRef,
  filterFieldOrder: filterFieldOrderProp,
  onFilterFieldOrderSave,
  listView,
}: ProductListFiltersSectionProps) {
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const controlledFieldOrder =
    filterFieldOrderProp && onFilterFieldOrderSave
      ? { order: filterFieldOrderProp, onChange: onFilterFieldOrderSave }
      : undefined;
  const { order: visibleOrder, setOrderFromModal } = useFilterFieldOrder(
    STORAGE_KEY,
    FILTER_IDS,
    undefined,
    controlledFieldOrder,
  );

  useEffect(() => {
    if (!openVisibilityRef) return;
    openVisibilityRef.current = () => setVisibilityOpen(true);
    return () => {
      openVisibilityRef.current = null;
    };
  }, [openVisibilityRef]);

  const renderField = (fieldId: string) => {
    switch (fieldId) {
      case "tenant":
        return (
          <FilterField key={fieldId} label="Tenant" labelClassName={listSellasistLabelClass}>
            <select
              className={listSellasistInputClass}
              value={tenantFilter ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                onTenantFilterChange(v === "" ? null : Number(v));
              }}
            >
              <option value="">Wszyscy</option>
              {tenants.map((tn) => (
                <option key={tn.id} value={tn.id}>
                  {tn.name}
                </option>
              ))}
            </select>
          </FilterField>
        );
      case "name":
        return (
          <FilterField key={fieldId} label="Nazwa" labelClassName={listSellasistLabelClass}>
            <input
              type="text"
              className={listSellasistInputClass}
              value={filters.name}
              onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
              placeholder="Szukaj po nazwie…"
            />
          </FilterField>
        );
      case "ean_sku":
        return (
          <FilterField key={fieldId} label="EAN / SKU" labelClassName={listSellasistLabelClass}>
            <input
              type="text"
              className={listSellasistInputClass}
              value={filters.eanSku}
              onChange={(e) => setFilters((f) => ({ ...f, eanSku: e.target.value }))}
              placeholder="EAN lub symbol…"
            />
          </FilterField>
        );
      case "stock_range":
        return (
          <FilterNumberRange
            key={fieldId}
            label="Stan magazynowy (od – do)"
            min={filters.stockMin}
            max={filters.stockMax}
            onMinChange={(v) => setFilters((f) => ({ ...f, stockMin: v }))}
            onMaxChange={(v) => setFilters((f) => ({ ...f, stockMax: v }))}
            step={1}
            inputClassName={`${listSellasistInputClass} no-number-spinner`}
            labelClassName={listSellasistLabelClass}
          />
        );
      case "price_range":
        return (
          <FilterNumberRange
            key={fieldId}
            label="Cena (zł) (od – do)"
            min={filters.priceMin}
            max={filters.priceMax}
            onMinChange={(v) => setFilters((f) => ({ ...f, priceMin: v }))}
            onMaxChange={(v) => setFilters((f) => ({ ...f, priceMax: v }))}
            step={0.01}
            inputClassName={`${listSellasistInputClass} no-number-spinner`}
            labelClassName={listSellasistLabelClass}
          />
        );
      case "weight_range":
        return (
          <FilterNumberRange
            key={fieldId}
            label="Waga (kg) (od – do)"
            min={filters.weightMin}
            max={filters.weightMax}
            onMinChange={(v) => setFilters((f) => ({ ...f, weightMin: v }))}
            onMaxChange={(v) => setFilters((f) => ({ ...f, weightMax: v }))}
            step={0.001}
            inputClassName={`${listSellasistInputClass} no-number-spinner`}
            labelClassName={listSellasistLabelClass}
          />
        );
      case "producer":
        return (
          <FilterField key={fieldId} label="Producent" labelClassName={listSellasistLabelClass}>
            <select
              className={listSellasistInputClass}
              value={filters.producer}
              onChange={(e) => setFilters((f) => ({ ...f, producer: e.target.value }))}
            >
              <option value="all">Wszyscy producenci</option>
              {producerOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </FilterField>
        );
      case "status":
        return (
          <FilterField key={fieldId} label="Status" labelClassName={listSellasistLabelClass}>
            <select
              className={listSellasistInputClass}
              value={filters.status}
              onChange={(e) =>
                setFilters((f) => ({ ...f, status: e.target.value as ProductListUiFilters["status"] }))
              }
            >
              <option value="all">Wszystkie</option>
              <option value="complete">Pełne dane (wymiary)</option>
              <option value="incomplete">Niepełne dane</option>
            </select>
          </FilterField>
        );
      case "has_locations":
        return (
          <FilterField key={fieldId} label="Lokalizacje fizyczne" labelClassName={listSellasistLabelClass}>
            <select
              className={listSellasistInputClass}
              value={filters.hasLocations}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  hasLocations: e.target.value as ProductListUiFilters["hasLocations"],
                }))
              }
            >
              <option value="all">Wszystkie</option>
              <option value="with">Tylko z lokalizacją</option>
              <option value="without">Tylko bez lokalizacji</option>
            </select>
          </FilterField>
        );
      case "mismatch":
        return (
          <FilterField key={fieldId} label="Niezgodność plan / stan" labelClassName={listSellasistLabelClass}>
            <select
              className={listSellasistInputClass}
              value={filters.mismatch}
              onChange={(e) =>
                setFilters((f) => ({ ...f, mismatch: e.target.value as ProductListUiFilters["mismatch"] }))
              }
            >
              <option value="all">Wszystkie</option>
              <option value="yes">Tak</option>
              <option value="no">Nie</option>
            </select>
          </FilterField>
        );
      default:
        return null;
    }
  };

  const orderedNodes = visibleOrder.map((id) => renderField(id)).filter(Boolean);

  return (
    <>
      <ListFilterEmbeddedShell expanded={expanded}>
        <FilterPanelBodyWithActions
          onClear={onClear}
          onApply={onApply}
          clearLabel="Wyczyść filtry"
          applyLabel="Filtruj"
          listView={listView}
        >
          <FilterGrid columnsClassName={listSellasistFilterGridClass4}>
            {orderedNodes}
          </FilterGrid>
          {clientMode ? (
            <p className="text-[11px] leading-snug text-slate-500">
              Filtry zaawansowane stosowane są lokalnie do pierwszych {clientBatchLimit} produktów zwróconych z API
              (sortowanie i nazwa/EAN/SKU nadal po stronie serwera).
            </p>
          ) : null}
        </FilterPanelBodyWithActions>
      </ListFilterEmbeddedShell>
      <FilterVisibilityModal
        open={visibilityOpen}
        onClose={() => setVisibilityOpen(false)}
        title="Widoczne pola — produkty"
        selectedOrder={visibleOrder}
        catalog={FILTER_CATALOG}
        onSave={setOrderFromModal}
      />
    </>
  );
}
