import api from "./axios";

import type {
  OrderUiMainGroup,
  OrderUiPanelSubgroupRead,
  OrderUiStatusBrief,
  OrderUiStatusCreatePayload,
  OrderUiStatusPanelSummary,
  OrderUiStatusRead,
  OrderUiStatusUpdatePayload,
} from "../types/orderUiStatus";

/** Backend `OrderRead` — sufficient for PATCH response / detail merge. */
export type OrderReadApi = {
  id: number;
  number?: string | null;
  status?: string | null;
  value?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  source?: string | null;
  items: Array<{
    id: number;
    quantity: number;
    unit_price?: number | null;
    product?: { name?: string | null; ean?: string | null; symbol?: string | null; sku?: string | null };
  }>;
  order_ui_status?: OrderUiStatusBrief | null;
};

export async function getOrderPanelSubgroups(tenantId: number, warehouseId: number): Promise<OrderUiPanelSubgroupRead[]> {
  const res = await api.get<OrderUiPanelSubgroupRead[]>("office/order-ui/panel-subgroups", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function createOrderPanelSubgroup(
  tenantId: number,
  warehouseId: number,
  body: { main_group: OrderUiMainGroup; name: string },
): Promise<OrderUiPanelSubgroupRead> {
  const res = await api.post<OrderUiPanelSubgroupRead>("office/order-ui/panel-subgroups", body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function updateOrderPanelSubgroup(
  subgroupId: number,
  tenantId: number,
  warehouseId: number,
  body: { name?: string; sort_order?: number },
): Promise<OrderUiPanelSubgroupRead> {
  const res = await api.patch<OrderUiPanelSubgroupRead>(`office/order-ui/panel-subgroups/${subgroupId}`, body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function deleteOrderPanelSubgroup(subgroupId: number, tenantId: number, warehouseId: number): Promise<void> {
  await api.delete(`office/order-ui/panel-subgroups/${subgroupId}`, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
}

export async function reorderOrderPanelSubgroups(
  tenantId: number,
  warehouseId: number,
  body: { main_group: OrderUiMainGroup; subgroup_id: number; direction: "up" | "down" },
): Promise<OrderUiPanelSubgroupRead[]> {
  const res = await api.post<OrderUiPanelSubgroupRead[]>("office/order-ui/panel-subgroups/reorder", body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function getOrderUiStatusSummary(
  tenantId: number,
  warehouseId?: number | null,
  opts?: { includeInactive?: boolean },
): Promise<OrderUiStatusPanelSummary> {
  const res = await api.get<OrderUiStatusPanelSummary>("office/order-ui/summary", {
    params: {
      tenant_id: tenantId,
      ...(warehouseId != null && warehouseId > 0 ? { warehouse_id: warehouseId } : {}),
      include_inactive: opts?.includeInactive === true ? true : undefined,
    },
  });
  return res.data;
}

export async function uploadOrderUiStatusImage(
  statusId: number,
  tenantId: number,
  warehouseId: number,
  file: File,
): Promise<OrderUiStatusRead> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post<OrderUiStatusRead>(`office/order-ui/statuses/${statusId}/image`, fd, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function createOrderUiStatus(
  tenantId: number,
  warehouseId: number,
  body: OrderUiStatusCreatePayload,
): Promise<OrderUiStatusRead> {
  const res = await api.post<OrderUiStatusRead>("office/order-ui/statuses", body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function updateOrderUiStatus(
  statusId: number,
  tenantId: number,
  warehouseId: number,
  body: OrderUiStatusUpdatePayload,
): Promise<OrderUiStatusRead> {
  const res = await api.patch<OrderUiStatusRead>(`office/order-ui/statuses/${statusId}`, body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export type OrderSubstatusReorderMove = {
  main_group: OrderUiMainGroup;
  status_id: number;
  direction: "up" | "down";
};

export type OrderSubstatusReorderFull = {
  main_group: OrderUiMainGroup;
  ordered_ids: number[];
};

export async function reorderOrderSubstatuses(
  tenantId: number,
  warehouseId: number,
  body: OrderSubstatusReorderMove | OrderSubstatusReorderFull,
): Promise<OrderUiStatusPanelSummary> {
  const res = await api.post<OrderUiStatusPanelSummary>("order-substatuses/reorder", {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    ...body,
  });
  return res.data;
}

export async function deleteOrderUiStatus(statusId: number, tenantId: number, warehouseId: number): Promise<void> {
  await api.delete(`office/order-ui/statuses/${statusId}`, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
}

export async function patchOrderUiStatus(
  orderId: number,
  tenantId: number,
  warehouseId: number,
  subStatusId: number | null,
): Promise<OrderReadApi> {
  const res = await api.patch<OrderReadApi>(`office/order-ui/orders/${orderId}/ui-status`, { sub_status_id: subStatusId }, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}
