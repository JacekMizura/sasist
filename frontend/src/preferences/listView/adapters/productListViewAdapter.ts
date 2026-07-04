import {
  migrateProductListColumnLayout,
  PRODUCT_LIST_DEFAULT_COLUMN_ORDER,
  PRODUCTS_COLUMNS_LAYOUT_KEY,
} from "../../../components/products/productList/productListColumnCatalog";
import {
  DEFAULT_PRODUCT_LIST_UI_FILTERS,
  type ProductListUiFilters,
} from "../../../pages/Products/productListUiFilters";
import {
  readLegacyColumnLayout,
  readLegacyFilterFieldOrder,
} from "../listViewCodec";
import { readFiltersExpandedLegacy } from "../listViewStorage";
import type { ListViewAdapterConfig, ListViewStatePayload } from "../listViewStateTypes";

export const PRODUCT_LIST_SCREEN_ID = "products.list";

const PRODUCT_FILTER_FIELD_STORAGE = "products.list.v3";
const PRODUCT_FILTER_FIELD_IDS = [
  "tenant",
  "name",
  "ean_sku",
  "stock_range",
  "price_range",
  "weight_range",
  "producer",
  "status",
  "has_locations",
  "mismatch",
] as const;

const ROWS_PER_PAGE_DEFAULT = 25;

function deserializeProductFilters(raw: unknown, defaults: ProductListUiFilters): ProductListUiFilters {
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Record<string, unknown>;
  const status = r.status;
  const hasLocations = r.hasLocations;
  const mismatch = r.mismatch;
  return {
    name: typeof r.name === "string" ? r.name : defaults.name,
    eanSku: typeof r.eanSku === "string" ? r.eanSku : defaults.eanSku,
    stockMin: typeof r.stockMin === "string" ? r.stockMin : defaults.stockMin,
    stockMax: typeof r.stockMax === "string" ? r.stockMax : defaults.stockMax,
    priceMin: typeof r.priceMin === "string" ? r.priceMin : defaults.priceMin,
    priceMax: typeof r.priceMax === "string" ? r.priceMax : defaults.priceMax,
    weightMin: typeof r.weightMin === "string" ? r.weightMin : defaults.weightMin,
    weightMax: typeof r.weightMax === "string" ? r.weightMax : defaults.weightMax,
    producer: typeof r.producer === "string" ? r.producer : defaults.producer,
    status: status === "complete" || status === "incomplete" || status === "all" ? status : defaults.status,
    hasLocations:
      hasLocations === "with" || hasLocations === "without" || hasLocations === "all"
        ? hasLocations
        : defaults.hasLocations,
    mismatch: mismatch === "yes" || mismatch === "no" || mismatch === "all" ? mismatch : defaults.mismatch,
  };
}

export function createProductListFactoryDefault(): ListViewStatePayload {
  return {
    filters: DEFAULT_PRODUCT_LIST_UI_FILTERS,
    sort: { key: "id", dir: "asc" },
    pagination: { pageSize: ROWS_PER_PAGE_DEFAULT, page: 1 },
    columns: { order: [...PRODUCT_LIST_DEFAULT_COLUMN_ORDER] },
    filterFields: { visibleOrder: [...PRODUCT_FILTER_FIELD_IDS] },
    ui: {
      filtersExpanded: true,
      extensions: { tenantFilter: null as number | null },
    },
  };
}

export function buildProductListViewAdapter(
  tenantId: number,
  allowedColumnIds: readonly string[],
): ListViewAdapterConfig<ProductListUiFilters> {
  return {
    screenId: PRODUCT_LIST_SCREEN_ID,
    tenantId,
    filterDefaults: DEFAULT_PRODUCT_LIST_UI_FILTERS,
    createFactoryDefault: createProductListFactoryDefault,
    serializeFilters: (f) => f,
    deserializeFilters: deserializeProductFilters,
    columnCatalog: {
      allowedIds: allowedColumnIds,
      defaultOrder: PRODUCT_LIST_DEFAULT_COLUMN_ORDER,
      migrate: migrateProductListColumnLayout,
    },
    filterFieldCatalog: {
      ids: PRODUCT_FILTER_FIELD_IDS,
    },
    legacyLocalStorage: () => ({
      columns: {
        order: readLegacyColumnLayout(PRODUCTS_COLUMNS_LAYOUT_KEY, {
          allowedIds: allowedColumnIds,
          defaultOrder: PRODUCT_LIST_DEFAULT_COLUMN_ORDER,
          migrate: migrateProductListColumnLayout,
        }),
      },
      filterFields: {
        visibleOrder: readLegacyFilterFieldOrder(PRODUCT_FILTER_FIELD_STORAGE, {
          ids: PRODUCT_FILTER_FIELD_IDS,
        }),
      },
      ui: {
        filtersExpanded: readFiltersExpandedLegacy("products.list.filtersExpanded", true),
      },
    }),
  };
}

export function readProductListTenantFilter(extensions: Record<string, unknown>): number | null {
  const v = extensions.tenantFilter;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
