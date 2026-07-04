import {
  MANUFACTURER_LIST_COLUMN_IDS,
  MANUFACTURER_LIST_DEFAULT_COLUMN_ORDER,
  MANUFACTURERS_LIST_COLUMNS_LAYOUT_KEY,
} from "../../../components/manufacturers/manufacturerList/manufacturerListColumnCatalog";
import {
  DEFAULT_APPLIED_MANUFACTURER_LIST_FILTERS,
  type AppliedManufacturerListFilters,
} from "../../../components/manufacturers/manufacturerList/manufacturerListFilterTypes";
import { buildListViewAdapterConfig, factoryPayload, mergeFilterDefaults } from "../listViewAdapterFactory";
import type { ListViewAdapterConfig } from "../listViewStateTypes";

export const MANUFACTURER_LIST_SCREEN_ID = "manufacturers.list";

const FILTER_FIELD_IDS = ["name", "country", "status", "nip", "city", "email", "phone", "supplier"] as const;

export function buildManufacturerListViewAdapter(
  tenantId: number,
): ListViewAdapterConfig<AppliedManufacturerListFilters> {
  return buildListViewAdapterConfig({
    screenId: MANUFACTURER_LIST_SCREEN_ID,
    tenantId,
    filterDefaults: DEFAULT_APPLIED_MANUFACTURER_LIST_FILTERS,
    createFactoryDefault: () =>
      factoryPayload(
        DEFAULT_APPLIED_MANUFACTURER_LIST_FILTERS,
        MANUFACTURER_LIST_DEFAULT_COLUMN_ORDER,
        FILTER_FIELD_IDS,
        { filtersExpanded: false, extensions: { tenantId } },
      ),
    columnCatalog: {
      allowedIds: MANUFACTURER_LIST_COLUMN_IDS,
      defaultOrder: MANUFACTURER_LIST_DEFAULT_COLUMN_ORDER,
    },
    filterFieldCatalog: {
      ids: FILTER_FIELD_IDS,
      defaultVisible: FILTER_FIELD_IDS,
    },
    legacy: {
      columnKey: MANUFACTURERS_LIST_COLUMNS_LAYOUT_KEY,
      filtersExpandedKey: "manufacturers.list.filtersExpanded",
    },
    deserializeFilters: (raw, defaults) => mergeFilterDefaults(defaults, raw),
  });
}
