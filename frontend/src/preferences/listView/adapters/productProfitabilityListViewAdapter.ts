import {
  PRODUCT_PROFITABILITY_COLUMN_IDS,
  PRODUCT_PROFITABILITY_DEFAULT_COLUMN_ORDER,
  PRODUCT_PROFITABILITY_COLUMNS_LAYOUT_KEY,
} from "../../../components/productProfitability/productProfitabilityColumnCatalog";
import {
  DEFAULT_APPLIED_PRODUCT_PROFITABILITY_FILTERS,
  type AppliedProductProfitabilityFilters,
} from "../../../components/productProfitability/productProfitabilityFilterTypes";
import { buildListViewAdapterConfig, factoryPayload, mergeFilterDefaults } from "../listViewAdapterFactory";
import type { ListViewAdapterConfig } from "../listViewStateTypes";

export const PRODUCT_PROFITABILITY_SCREEN_ID = "products.profitability.list";

const FILTER_FIELD_IDS = [
  "range_days",
  "sort",
  "only_loss",
  "only_low_margin",
  "only_no_sales",
  "only_top_profit",
  "only_high_stock",
] as const;

export function buildProductProfitabilityListViewAdapter(
  tenantId: number,
): ListViewAdapterConfig<AppliedProductProfitabilityFilters> {
  return buildListViewAdapterConfig({
    screenId: PRODUCT_PROFITABILITY_SCREEN_ID,
    tenantId,
    filterDefaults: DEFAULT_APPLIED_PRODUCT_PROFITABILITY_FILTERS,
    createFactoryDefault: () =>
      factoryPayload(
        DEFAULT_APPLIED_PRODUCT_PROFITABILITY_FILTERS,
        PRODUCT_PROFITABILITY_DEFAULT_COLUMN_ORDER,
        FILTER_FIELD_IDS,
        { filtersExpanded: false, extensions: { tenantId } },
      ),
    columnCatalog: {
      allowedIds: PRODUCT_PROFITABILITY_COLUMN_IDS,
      defaultOrder: PRODUCT_PROFITABILITY_DEFAULT_COLUMN_ORDER,
    },
    filterFieldCatalog: {
      ids: FILTER_FIELD_IDS,
      defaultVisible: FILTER_FIELD_IDS,
    },
    legacy: {
      columnKey: PRODUCT_PROFITABILITY_COLUMNS_LAYOUT_KEY,
      filtersExpandedKey: "products.profitability.filtersExpanded",
    },
    deserializeFilters: (raw, defaults) => {
      const merged = mergeFilterDefaults(defaults, raw);
      if (raw && typeof raw === "object" && "rangeDays" in raw) {
        const n = Number((raw as Record<string, unknown>).rangeDays);
        if (Number.isFinite(n)) merged.rangeDays = n;
      }
      return merged;
    },
  });
}
