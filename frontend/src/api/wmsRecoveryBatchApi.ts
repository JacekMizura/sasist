import api from "./axios";

export type WmsRecoveryBatchRouteGroupApi = {
  location_code: string;
  line_count: number;
  order_ids: number[];
  lines: Record<string, unknown>[];
};

export type WmsRecoveryBatchSessionApi = {
  id: number;
  label: string;
  status: string;
  order_ids: number[];
  order_count: number;
  line_count: number;
  route_groups: WmsRecoveryBatchRouteGroupApi[];
};

export async function createWmsRecoveryBatch(
  tenantId: number,
  warehouseId: number,
  body?: { order_ids?: number[]; max_orders?: number },
): Promise<WmsRecoveryBatchSessionApi> {
  const res = await api.post<WmsRecoveryBatchSessionApi>("/wms/picking/recovery/batch", body ?? {}, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function getWmsRecoveryBatch(
  tenantId: number,
  batchId: number,
): Promise<WmsRecoveryBatchSessionApi> {
  const res = await api.get<WmsRecoveryBatchSessionApi>(`/wms/picking/recovery/batch/${batchId}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}
