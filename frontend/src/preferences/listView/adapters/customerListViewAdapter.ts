import {
  CUSTOMER_LIST_COLUMN_IDS,
  CUSTOMER_LIST_DEFAULT_COLUMN_ORDER,
  CUSTOMERS_LIST_COLUMNS_LAYOUT_KEY,
} from "../../../components/customers/customerList/customerListColumnCatalog";
import {
  DEFAULT_APPLIED_CUSTOMER_LIST_FILTERS,
  type AppliedCustomerListFilters,
} from "../../../components/customers/customerList/customerListFilterTypes";
import { buildListViewAdapterConfig, factoryPayload, mergeFilterDefaults } from "../listViewAdapterFactory";
import type { ListViewAdapterConfig } from "../listViewStateTypes";

export const CUSTOMER_LIST_SCREEN_ID = "customers.list";

const FILTER_FIELD_IDS = [
  "search",
  "country",
  "customer_type",
  "sales_channel",
  "has_orders",
  "has_email",
  "has_phone",
  "date_range",
] as const;

const DEFAULT_VISIBLE = ["search", "country", "customer_type", "sales_channel"] as const;

export function buildCustomerListViewAdapter(tenantId: number): ListViewAdapterConfig<AppliedCustomerListFilters> {
  return buildListViewAdapterConfig({
    screenId: CUSTOMER_LIST_SCREEN_ID,
    tenantId,
    filterDefaults: DEFAULT_APPLIED_CUSTOMER_LIST_FILTERS,
    createFactoryDefault: () =>
      factoryPayload(
        DEFAULT_APPLIED_CUSTOMER_LIST_FILTERS,
        CUSTOMER_LIST_DEFAULT_COLUMN_ORDER,
        DEFAULT_VISIBLE,
        { filtersExpanded: false },
      ),
    columnCatalog: {
      allowedIds: CUSTOMER_LIST_COLUMN_IDS,
      defaultOrder: CUSTOMER_LIST_DEFAULT_COLUMN_ORDER,
    },
    filterFieldCatalog: {
      ids: FILTER_FIELD_IDS,
      defaultVisible: DEFAULT_VISIBLE,
    },
    legacy: {
      columnKey: CUSTOMERS_LIST_COLUMNS_LAYOUT_KEY,
      filterFieldsKey: "customers.list.v3",
      filtersExpandedKey: "customers.list.filtersExpanded",
    },
    deserializeFilters: (raw, defaults) => mergeFilterDefaults(defaults, raw),
  });
}
