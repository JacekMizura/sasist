import {
  DEFAULT_APPLIED_BUNDLE_LIST_FILTERS,
  type AppliedBundleListFilters,
} from "../../../components/bundles/bundleList/bundleListFilterTypes";
import { buildListViewAdapterConfig, factoryPayload, mergeFilterDefaults } from "../listViewAdapterFactory";
import type { ListViewAdapterConfig } from "../listViewStateTypes";

export const BUNDLE_LIST_SCREEN_ID = "bundles.list";

const FILTER_FIELD_IDS = ["name", "ean_sku", "stock_range", "price_range", "status"] as const;
const PLACEHOLDER_COLUMNS = ["id"] as const;

export function buildBundleListViewAdapter(tenantId: number): ListViewAdapterConfig<AppliedBundleListFilters> {
  return buildListViewAdapterConfig({
    screenId: BUNDLE_LIST_SCREEN_ID,
    tenantId,
    filterDefaults: DEFAULT_APPLIED_BUNDLE_LIST_FILTERS,
    createFactoryDefault: () =>
      factoryPayload(DEFAULT_APPLIED_BUNDLE_LIST_FILTERS, PLACEHOLDER_COLUMNS, FILTER_FIELD_IDS, {
        filtersExpanded: false,
        extensions: { tenantId },
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
      filterFieldsKey: "bundles.list.v2",
      filtersExpandedKey: "bundles.list.filtersExpanded",
    },
    deserializeFilters: (raw, defaults) => mergeFilterDefaults(defaults, raw),
  });
}
