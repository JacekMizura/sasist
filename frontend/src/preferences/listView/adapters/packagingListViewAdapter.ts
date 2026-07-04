import {
  PACKAGING_LIST_COLUMN_IDS,
  PACKAGING_LIST_DEFAULT_COLUMN_ORDER,
  PACKAGING_LIST_COLUMNS_LAYOUT_KEY,
} from "../../../components/warehouseMaterials/packagingList/packagingListColumnCatalog";
import {
  DEFAULT_APPLIED_PACKAGING_LIST_FILTERS,
  type AppliedPackagingListFilters,
} from "../../../components/warehouseMaterials/packagingList/packagingListFilterTypes";
import { buildListViewAdapterConfig, factoryPayload, mergeFilterDefaults } from "../listViewAdapterFactory";
import type { ListViewAdapterConfig } from "../listViewStateTypes";

export const PACKAGING_LIST_SCREEN_ID = "warehouse_materials.packaging.list";

const FILTER_FIELD_IDS = ["search", "material_type", "supplier", "low_stock", "status", "sort"] as const;

export function buildPackagingListViewAdapter(tenantId: number): ListViewAdapterConfig<AppliedPackagingListFilters> {
  return buildListViewAdapterConfig({
    screenId: PACKAGING_LIST_SCREEN_ID,
    tenantId,
    filterDefaults: DEFAULT_APPLIED_PACKAGING_LIST_FILTERS,
    createFactoryDefault: () =>
      factoryPayload(DEFAULT_APPLIED_PACKAGING_LIST_FILTERS, PACKAGING_LIST_DEFAULT_COLUMN_ORDER, FILTER_FIELD_IDS, {
        filtersExpanded: false,
        extensions: { tenantId },
      }),
    columnCatalog: {
      allowedIds: PACKAGING_LIST_COLUMN_IDS,
      defaultOrder: PACKAGING_LIST_DEFAULT_COLUMN_ORDER,
    },
    filterFieldCatalog: {
      ids: FILTER_FIELD_IDS,
      defaultVisible: FILTER_FIELD_IDS,
    },
    legacy: {
      columnKey: PACKAGING_LIST_COLUMNS_LAYOUT_KEY,
      filtersExpandedKey: "warehouse_materials.packaging.filtersExpanded",
    },
    deserializeFilters: (raw, defaults) => mergeFilterDefaults(defaults, raw),
  });
}
