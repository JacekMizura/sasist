import api from "./axios";
import type { EntityBulkDeleteResult } from "../types/entityBulkDelete";
import type { OrderBulkListFiltersPayload } from "../utils/orderListBulkFilters";

export type BulkPanelStatusBody = {
  ids: string[];
  status: string;
};

/** POST /orders/bulk-status — explicit ids (string) or replay list filters on the server. */
export type OrdersBulkPanelStatusBody =
  | { selection_mode: "explicit_ids"; ids: string[]; status: string }
  | { selection_mode: "filtered_query"; filters: OrderBulkListFiltersPayload; status: string };

export async function postOrdersBulkPanelStatus(
  tenantId: number,
  warehouseId: number,
  body: OrdersBulkPanelStatusBody,
): Promise<{ updated: number }> {
  const res = await api.post<{ updated: number }>("orders/bulk-status", body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function postReturnsBulkPanelStatus(
  tenantId: number,
  body: BulkPanelStatusBody,
  warehouseId?: number | null,
): Promise<{ updated: number }> {
  const params: Record<string, number> = { tenant_id: tenantId };
  if (warehouseId != null && Number.isFinite(warehouseId)) {
    params.warehouse_id = warehouseId;
  }
  const res = await api.post<{ updated: number }>("returns/bulk-status", body, { params });
  return res.data;
}

export async function deletePanelReturn(
  tenantId: number,
  returnId: number,
  warehouseId?: number | null,
): Promise<EntityBulkDeleteResult> {
  const params: Record<string, number> = { tenant_id: tenantId };
  if (warehouseId != null && Number.isFinite(Number(warehouseId)) && Number(warehouseId) > 0) {
    params.warehouse_id = Number(warehouseId);
  }
  const res = await api.delete<EntityBulkDeleteResult>(`returns/${returnId}`, { params });
  return res.data;
}

export async function postReturnsBulkDelete(
  tenantId: number,
  body: { ids: number[] },
  warehouseId?: number | null,
): Promise<EntityBulkDeleteResult> {
  const params: Record<string, number> = { tenant_id: tenantId };
  if (warehouseId != null && Number.isFinite(Number(warehouseId)) && Number(warehouseId) > 0) {
    params.warehouse_id = Number(warehouseId);
  }
  const res = await api.post<EntityBulkDeleteResult>("returns/bulk-delete", body, { params });
  return res.data;
}
