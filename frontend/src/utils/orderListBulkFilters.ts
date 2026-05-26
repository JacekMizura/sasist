import type { OrderPanelFilter } from "../components/orders/OrdersPanelStatusSidebar";
import type { AppliedOrderListFilters } from "../components/orders/orderList/orderListFilterTypes";

/** Mirrors backend ``OrderBulkListFilters`` (POST orders bulk / bulk-patch / bulk-delete). */
export type OrderBulkListFiltersPayload = {
  search?: string | null;
  order_type?: string | null;
  order_id?: string | null;
  volume_min?: number | null;
  volume_max?: number | null;
  status?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  filter_shipping_method_id?: string | null;
  source_contains?: string | null;
  order_value_min?: number | null;
  order_value_max?: number | null;
  panel_order_ui_status_ids?: string | null;
  panel_order_ui_unassigned?: boolean;
  panel_order_ui_status_id?: number | null;
  panel_order_ui_main_group?: string | null;
  payment_status?: string | null;
  paid_only?: boolean;
  unpaid_only?: boolean;
  with_document?: boolean;
  without_document?: boolean;
  include_archived_orders?: boolean;
};

export function buildOrderBulkListFiltersPayload(
  af: AppliedOrderListFilters,
  panelFilter: OrderPanelFilter,
): OrderBulkListFiltersPayload {
  const o: OrderBulkListFiltersPayload = {};
  if (af.search.trim()) o.search = af.search.trim();
  if (af.orderType.trim()) o.order_type = af.orderType.trim();
  if (af.dateFrom.trim()) o.date_from = af.dateFrom.trim();
  if (af.dateTo.trim()) o.date_to = af.dateTo.trim();
  if (af.shippingMethodId.trim()) o.filter_shipping_method_id = af.shippingMethodId.trim();
  if (af.sourceContains.trim()) o.source_contains = af.sourceContains.trim();
  const vmin = parseFloat(af.valueMin);
  if (!Number.isNaN(vmin) && af.valueMin.trim() !== "") o.order_value_min = vmin;
  const vmax = parseFloat(af.valueMax);
  if (!Number.isNaN(vmax) && af.valueMax.trim() !== "") o.order_value_max = vmax;

  if (af.panelStatusIds.length > 0) {
    o.panel_order_ui_status_ids = af.panelStatusIds.join(",");
  } else if (panelFilter === "unassigned") {
    o.panel_order_ui_unassigned = true;
  } else if (typeof panelFilter === "object" && panelFilter.kind === "sub") {
    o.panel_order_ui_status_id = panelFilter.id;
  } else if (typeof panelFilter === "object" && panelFilter.kind === "group") {
    o.panel_order_ui_main_group = panelFilter.group;
  }

  if (af.paidOnly) o.paid_only = true;
  if (af.unpaidOnly) o.unpaid_only = true;
  if (!af.paidOnly && !af.unpaidOnly && af.paymentStatus.trim()) o.payment_status = af.paymentStatus.trim();
  if (af.withDocument) o.with_document = true;
  if (af.withoutDocument) o.without_document = true;
  if (af.includeArchived) o.include_archived_orders = true;
  return o;
}
