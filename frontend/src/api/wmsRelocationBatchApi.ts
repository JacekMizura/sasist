import api from "./axios";

export type WmsRelocationBatchContextApi = {
  order_id: number;
  warehouse_id: number;
  document_id: number | null;
  document_label: string | null;
  relocation_task_id: number | null;
  pending_lines: number;
  has_active_document: boolean;
};

export type WmsRelocationAddItemsOutApi = {
  ok: boolean;
  order_id: number;
  document_id: number;
  document_label: string;
  lines_added: number;
  lines_skipped: number;
  relocation_task_id: number | null;
  redirect_to_relocation: boolean;
};

export type WmsRelocationStartSessionOutApi = {
  ok: boolean;
  task_id: number;
  document_id: number | null;
  document_label: string | null;
  session_started: boolean;
};

export async function fetchWmsRelocationBatchContext(
  tenantId: number,
  warehouseId: number,
  orderId: number,
): Promise<WmsRelocationBatchContextApi> {
  const res = await api.get<WmsRelocationBatchContextApi>("/wms/relocation/batch-context", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, order_id: orderId },
  });
  return res.data;
}

export async function postWmsRelocationAddItems(
  tenantId: number,
  warehouseId: number,
  body: { order_id: number; order_item_ids?: number[] },
): Promise<WmsRelocationAddItemsOutApi> {
  const res = await api.post<WmsRelocationAddItemsOutApi>("/wms/relocation/add-items", body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function postWmsRelocationStartSession(
  tenantId: number,
  warehouseId: number,
  body: { order_id?: number; task_id?: number; takeover?: boolean },
): Promise<WmsRelocationStartSessionOutApi> {
  const res = await api.post<WmsRelocationStartSessionOutApi>("/wms/relocation/start-session", body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}
