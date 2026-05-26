import api from "./axios";
import type {
  ReturnStatusCreatePayload,
  ReturnStatusRead,
  ReturnStatusUpdatePayload,
} from "../types/wmsReturn";

export async function listReturnStatuses(
  tenantId: number,
  warehouseId: number,
): Promise<ReturnStatusRead[]> {
  const res = await api.get<ReturnStatusRead[]>("wms/return-statuses", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return Array.isArray(res.data) ? res.data : [];
}

export async function createReturnStatus(
  tenantId: number,
  warehouseId: number,
  body: ReturnStatusCreatePayload,
): Promise<ReturnStatusRead> {
  const res = await api.post<ReturnStatusRead>("wms/return-statuses", body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function updateReturnStatus(
  statusId: number,
  tenantId: number,
  warehouseId: number,
  body: ReturnStatusUpdatePayload,
): Promise<ReturnStatusRead> {
  const res = await api.put<ReturnStatusRead>(`wms/return-statuses/${statusId}`, body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function deleteReturnStatus(
  statusId: number,
  tenantId: number,
  warehouseId: number,
): Promise<void> {
  await api.delete(`wms/return-statuses/${statusId}`, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
}
