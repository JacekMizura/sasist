import {
  DEFAULT_PRODUCTION_ORDERS_FILTERS,
  type ProductionOrdersListFilters,
} from "../../../modules/production/productionListFilters";
import { buildListViewAdapterConfig, factoryPayload, mergeFilterDefaults } from "../listViewAdapterFactory";
import type { ListViewAdapterConfig } from "../listViewStateTypes";

export const PRODUCTION_ORDERS_LIST_SCREEN_ID = "production.orders.list";

const FILTER_FIELD_IDS = [
  "query",
  "status",
  "operator",
  "product",
  "planned_from",
  "planned_to",
  "priority",
  "shortages_only",
] as const;

const PLACEHOLDER_COLUMNS = ["id"] as const;

export function buildProductionOrdersListViewAdapter(
  tenantId: number,
): ListViewAdapterConfig<ProductionOrdersListFilters> {
  return buildListViewAdapterConfig({
    screenId: PRODUCTION_ORDERS_LIST_SCREEN_ID,
    tenantId,
    filterDefaults: DEFAULT_PRODUCTION_ORDERS_FILTERS,
    createFactoryDefault: () =>
      factoryPayload(DEFAULT_PRODUCTION_ORDERS_FILTERS, PLACEHOLDER_COLUMNS, FILTER_FIELD_IDS, {
        filtersExpanded: false,
        extensions: { warehouseId: null },
      }),
    columnCatalog: {
      allowedIds: PLACEHOLDER_COLUMNS,
      defaultOrder: PLACEHOLDER_COLUMNS,
    },
    filterFieldCatalog: {
      ids: FILTER_FIELD_IDS,
      defaultVisible: FILTER_FIELD_IDS,
    },
    legacy: {
      filtersExpandedKey: "production.orders.filtersExpanded",
    },
    deserializeFilters: (raw, defaults) => mergeFilterDefaults(defaults, raw),
  });
}
