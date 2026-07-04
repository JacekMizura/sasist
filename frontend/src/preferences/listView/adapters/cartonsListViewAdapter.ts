import {
  CARTONS_LIST_COLUMN_IDS,
  CARTONS_LIST_DEFAULT_COLUMN_ORDER,
  CARTONS_LIST_COLUMNS_LAYOUT_KEY,
} from "../../../components/warehouseMaterials/cartonsList/cartonsListColumnCatalog";
import {
  DEFAULT_APPLIED_CARTONS_LIST_FILTERS,
  type AppliedCartonsListFilters,
} from "../../../components/warehouseMaterials/cartonsList/cartonsListFilterTypes";
import { buildListViewAdapterConfig, factoryPayload, mergeFilterDefaults } from "../listViewAdapterFactory";
import type { ListViewAdapterConfig } from "../listViewStateTypes";

export const CARTONS_LIST_SCREEN_ID = "warehouse_materials.cartons.list";

const FILTER_FIELD_IDS = ["search", "status", "sort"] as const;

export function buildCartonsListViewAdapter(tenantId: number): ListViewAdapterConfig<AppliedCartonsListFilters> {
  return buildListViewAdapterConfig({
    screenId: CARTONS_LIST_SCREEN_ID,
    tenantId,
    filterDefaults: DEFAULT_APPLIED_CARTONS_LIST_FILTERS,
    createFactoryDefault: () =>
      factoryPayload(DEFAULT_APPLIED_CARTONS_LIST_FILTERS, CARTONS_LIST_DEFAULT_COLUMN_ORDER, FILTER_FIELD_IDS, {
        filtersExpanded: false,
        extensions: { tenantId },
      }),
    columnCatalog: {
      allowedIds: CARTONS_LIST_COLUMN_IDS,
      defaultOrder: CARTONS_LIST_DEFAULT_COLUMN_ORDER,
    },
    filterFieldCatalog: {
      ids: FILTER_FIELD_IDS,
      defaultVisible: FILTER_FIELD_IDS,
    },
    legacy: {
      columnKey: CARTONS_LIST_COLUMNS_LAYOUT_KEY,
      filtersExpandedKey: "warehouse_materials.cartons.filtersExpanded",
    },
    deserializeFilters: (raw, defaults) => mergeFilterDefaults(defaults, raw),
  });
}
