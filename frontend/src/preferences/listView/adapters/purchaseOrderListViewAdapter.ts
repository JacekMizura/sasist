import type { DeliveryStatus } from "../../../api/inboundDeliveriesApi";
import { buildListViewAdapterConfig, factoryPayload, mergeFilterDefaults } from "../listViewAdapterFactory";
import type { ListViewAdapterConfig } from "../listViewStateTypes";

export const PURCHASE_ORDER_LIST_SCREEN_ID = "purchase_orders.list";

export type AppliedPurchaseOrderListFilters = {
  search: string;
  supplierId: number;
  status: "" | DeliveryStatus;
  dateFrom: string;
  dateTo: string;
};

export const DEFAULT_APPLIED_PURCHASE_ORDER_LIST_FILTERS: AppliedPurchaseOrderListFilters = {
  search: "",
  supplierId: 0,
  status: "",
  dateFrom: "",
  dateTo: "",
};

const FILTER_FIELD_IDS = ["search", "supplier", "status", "date_range"] as const;
const PLACEHOLDER_COLUMNS = ["id"] as const;

export function buildPurchaseOrderListViewAdapter(
  tenantId: number,
): ListViewAdapterConfig<AppliedPurchaseOrderListFilters> {
  return buildListViewAdapterConfig({
    screenId: PURCHASE_ORDER_LIST_SCREEN_ID,
    tenantId,
    filterDefaults: DEFAULT_APPLIED_PURCHASE_ORDER_LIST_FILTERS,
    createFactoryDefault: () =>
      factoryPayload(DEFAULT_APPLIED_PURCHASE_ORDER_LIST_FILTERS, PLACEHOLDER_COLUMNS, FILTER_FIELD_IDS, {
        filtersExpanded: true,
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
      filtersExpandedKey: "purchase_orders.list.filtersExpanded",
    },
    deserializeFilters: (raw, defaults) => {
      const merged = mergeFilterDefaults(defaults, raw);
      if (raw && typeof raw === "object" && "supplierId" in raw) {
        const n = Number((raw as Record<string, unknown>).supplierId);
        merged.supplierId = Number.isFinite(n) ? n : defaults.supplierId;
      }
      return merged;
    },
  });
}
