import {
  SUPPLIER_LIST_COLUMN_IDS,
  SUPPLIER_LIST_DEFAULT_COLUMN_ORDER,
  SUPPLIERS_LIST_COLUMNS_LAYOUT_KEY,
} from "../../../components/suppliers/supplierList/supplierListColumnCatalog";
import {
  DEFAULT_APPLIED_SUPPLIER_LIST_FILTERS,
  type AppliedSupplierListFilters,
} from "../../../components/suppliers/supplierList/supplierListFilterTypes";
import { buildListViewAdapterConfig, factoryPayload, mergeFilterDefaults } from "../listViewAdapterFactory";
import type { ListViewAdapterConfig } from "../listViewStateTypes";

export const SUPPLIER_LIST_SCREEN_ID = "suppliers.list";

const FILTER_FIELD_IDS = ["name", "status", "country", "city", "email", "phone", "currency", "moq", "shipping", "counts"] as const;

export function buildSupplierListViewAdapter(tenantId: number): ListViewAdapterConfig<AppliedSupplierListFilters> {
  return buildListViewAdapterConfig({
    screenId: SUPPLIER_LIST_SCREEN_ID,
    tenantId,
    filterDefaults: DEFAULT_APPLIED_SUPPLIER_LIST_FILTERS,
    createFactoryDefault: () =>
      factoryPayload(
        DEFAULT_APPLIED_SUPPLIER_LIST_FILTERS,
        SUPPLIER_LIST_DEFAULT_COLUMN_ORDER,
        FILTER_FIELD_IDS,
        { filtersExpanded: false, extensions: { tenantId } },
      ),
    columnCatalog: {
      allowedIds: SUPPLIER_LIST_COLUMN_IDS,
      defaultOrder: SUPPLIER_LIST_DEFAULT_COLUMN_ORDER,
    },
    filterFieldCatalog: {
      ids: FILTER_FIELD_IDS,
      defaultVisible: FILTER_FIELD_IDS,
    },
    legacy: {
      columnKey: SUPPLIERS_LIST_COLUMNS_LAYOUT_KEY,
      filtersExpandedKey: "suppliers.list.filtersExpanded",
    },
    deserializeFilters: (raw, defaults) => mergeFilterDefaults(defaults, raw),
  });
}
