import {
  migrateOrderListColumnIds,
  ORDER_LIST_DEFAULT_TABLE_COLUMN_ORDER,
  ORDER_LIST_USER_COLUMN_IDS,
} from "../../../components/orders/orderList/orderListColumnCatalog";
import {
  DEFAULT_APPLIED_ORDER_LIST_FILTERS,
  type AppliedOrderListFilters,
} from "../../../components/orders/orderList/orderListFilterTypes";
import { ORDERS_COLUMNS_LAYOUT_KEY } from "../../columnLayoutPreferences";
import {
  readLegacyColumnLayout,
  readLegacyFilterFieldOrder,
} from "../listViewCodec";
import { readFiltersExpandedLegacy } from "../listViewStorage";
import type { ListViewAdapterConfig, ListViewStatePayload } from "./listViewStateTypes";

export const ORDER_LIST_SCREEN_ID = "orders.list";

const ORDER_LIST_FILTER_FIELD_STORAGE = "orders.list.v5";
const ORDER_LIST_FILTER_FIELD_IDS = [
  "search",
  "payment_status",
  "shipping_method",
  "date_range",
  "warehouse",
  "source",
  "value_range",
  "order_type",
  "panel_status",
  "extra_flags",
] as const;

const ORDER_LIST_DEFAULT_VISIBLE_FILTER_FIELDS = [
  "search",
  "payment_status",
  "shipping_method",
  "date_range",
] as const;

const ROWS_PER_PAGE_DEFAULT = 25;

function deserializeOrderFilters(raw: unknown, defaults: AppliedOrderListFilters): AppliedOrderListFilters {
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Record<string, unknown>;
  return {
    search: typeof r.search === "string" ? r.search : defaults.search,
    panelStatusIds: Array.isArray(r.panelStatusIds)
      ? r.panelStatusIds.map((x) => Number(x)).filter((x) => Number.isFinite(x))
      : defaults.panelStatusIds,
    paymentStatus: typeof r.paymentStatus === "string" ? r.paymentStatus : defaults.paymentStatus,
    shippingMethodId: typeof r.shippingMethodId === "string" ? r.shippingMethodId : defaults.shippingMethodId,
    dateFrom: typeof r.dateFrom === "string" ? r.dateFrom : defaults.dateFrom,
    dateTo: typeof r.dateTo === "string" ? r.dateTo : defaults.dateTo,
    warehouseIdOverride:
      r.warehouseIdOverride == null || r.warehouseIdOverride === ""
        ? null
        : Number.isFinite(Number(r.warehouseIdOverride))
          ? Number(r.warehouseIdOverride)
          : defaults.warehouseIdOverride,
    sourceContains: typeof r.sourceContains === "string" ? r.sourceContains : defaults.sourceContains,
    valueMin: typeof r.valueMin === "string" ? r.valueMin : defaults.valueMin,
    valueMax: typeof r.valueMax === "string" ? r.valueMax : defaults.valueMax,
    orderType: typeof r.orderType === "string" ? r.orderType : defaults.orderType,
    paidOnly: Boolean(r.paidOnly),
    unpaidOnly: Boolean(r.unpaidOnly),
    withDocument: Boolean(r.withDocument),
    withoutDocument: Boolean(r.withoutDocument),
    includeArchived: Boolean(r.includeArchived),
    directSalesOnly: Boolean(r.directSalesOnly),
    immediateFulfillmentOnly: Boolean(r.immediateFulfillmentOnly),
  };
}

export function createOrderListFactoryDefault(): ListViewStatePayload {
  return {
    filters: DEFAULT_APPLIED_ORDER_LIST_FILTERS,
    sort: { key: "order_date", dir: "desc" },
    pagination: { pageSize: ROWS_PER_PAGE_DEFAULT, page: 1 },
    columns: { order: [...ORDER_LIST_DEFAULT_TABLE_COLUMN_ORDER] },
    filterFields: { visibleOrder: [...ORDER_LIST_DEFAULT_VISIBLE_FILTER_FIELDS] },
    ui: {
      filtersExpanded: false,
      extensions: { panelFilter: "all", statusPanelCollapsed: false },
    },
  };
}

export function buildOrderListViewAdapter(tenantId: number): ListViewAdapterConfig<AppliedOrderListFilters> {
  return {
    screenId: ORDER_LIST_SCREEN_ID,
    tenantId,
    filterDefaults: DEFAULT_APPLIED_ORDER_LIST_FILTERS,
    createFactoryDefault: createOrderListFactoryDefault,
    serializeFilters: (f) => f,
    deserializeFilters: deserializeOrderFilters,
    columnCatalog: {
      allowedIds: ORDER_LIST_USER_COLUMN_IDS,
      defaultOrder: ORDER_LIST_DEFAULT_TABLE_COLUMN_ORDER,
      migrate: migrateOrderListColumnIds,
    },
    filterFieldCatalog: {
      ids: ORDER_LIST_FILTER_FIELD_IDS,
      defaultVisible: ORDER_LIST_DEFAULT_VISIBLE_FILTER_FIELDS,
    },
    legacyLocalStorage: () => ({
      columns: {
        order: readLegacyColumnLayout(ORDERS_COLUMNS_LAYOUT_KEY, {
          allowedIds: ORDER_LIST_USER_COLUMN_IDS,
          defaultOrder: ORDER_LIST_DEFAULT_TABLE_COLUMN_ORDER,
          migrate: migrateOrderListColumnIds,
        }),
      },
      filterFields: {
        visibleOrder: readLegacyFilterFieldOrder(ORDER_LIST_FILTER_FIELD_STORAGE, {
          ids: ORDER_LIST_FILTER_FIELD_IDS,
          defaultVisible: ORDER_LIST_DEFAULT_VISIBLE_FILTER_FIELDS,
        }),
      },
      ui: {
        filtersExpanded: readFiltersExpandedLegacy("orders.list.filtersExpanded", false),
      },
    }),
  };
}

export function readOrderListPanelFilter(extensions: Record<string, unknown>): unknown {
  const v = extensions.panelFilter;
  if (v == null) return "all";
  return v;
}
