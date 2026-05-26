import api from "./axios";
import type { StockDocumentRead } from "./stockDocumentsApi";

export type WmsReplenishmentBufferSource = {
  location_id: number;
  location_name?: string;
  quantity: number;
};

export type WmsReplenishmentLine = {
  product_id: number;
  product_name?: string;
  product_sku?: string | null;
  product_ean?: string | null;
  product_image_url?: string | null;
  pick_location_id: number;
  pick_location_name?: string;
  pick_stock: number;
  min_level: number;
  missing_qty: number;
  buffer_location_id: number;
  buffer_location_name?: string;
  buffer_stock_at_source: number;
  suggested_qty: number;
  /** All BUFFER bins with stock; fallback for older API is single primary buffer. */
  buffer_sources?: WmsReplenishmentBufferSource[];
};

export async function fetchWmsReplenishmentLines(
  tenantId: number,
  warehouseId: number,
): Promise<WmsReplenishmentLine[]> {
  const res = await api.get<WmsReplenishmentLine[]>("/wms/replenishment/lines", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function executeWmsReplenishment(
  tenantId: number,
  body: {
    warehouse_id: number;
    product_id: number;
    from_location_id: number;
    to_location_id: number;
    quantity: number;
  },
): Promise<{ document: StockDocumentRead }> {
  const res = await api.post<{ document: StockDocumentRead }>("/wms/replenishment/execute", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export type WmsReplenishmentTaskSourceSegment = {
  location_id: number;
  location_code?: string;
  quantity_planned: number;
  quantity_done?: number;
};

export type WmsReplenishmentTaskRead = {
  id: number;
  tenant_id: number;
  warehouse_id: number;
  product_id: number;
  source_location_id: number;
  target_location_id: number;
  quantity: number;
  priority_score: number;
  priority_band: string;
  status: string;
  created_at?: string | null;
  completed_at?: string | null;
  assigned_admin_id?: number | null;
  product_name?: string;
  product_sku?: string | null;
  product_ean?: string | null;
  product_image_url?: string | null;
  source_location_code?: string;
  target_location_code?: string;
  pick_stock?: number;
  reserve_stock?: number;
  min_pick_level?: number | null;
  max_pick_level?: number | null;
  /** Łańcuch źródeł BUFFER (plan / wykonanie); brak w starszym API — wtedy jedno źródło po source_location_id. */
  sources?: WmsReplenishmentTaskSourceSegment[];
  warehouse_zone?: string;
  location_sort?: [string, string, string, string];
  days_of_cover?: number | null;
};

export type WmsReplenishmentTaskView = "location" | "priority";

export async function fetchWmsReplenishmentTasks(
  tenantId: number,
  warehouseId: number,
  view: WmsReplenishmentTaskView,
): Promise<WmsReplenishmentTaskRead[]> {
  const res = await api.get<WmsReplenishmentTaskRead[]>("/wms/replenishment/tasks", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, view },
  });
  return res.data;
}

export async function fetchWmsReplenishmentTask(tenantId: number, taskId: number): Promise<WmsReplenishmentTaskRead> {
  const res = await api.get<WmsReplenishmentTaskRead>(`/wms/replenishment/tasks/${taskId}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export type WmsReplenishmentTaskGenerateResult = {
  created: number;
  skipped_existing: number;
  updated?: number;
  removed?: number;
};

export async function postWmsReplenishmentTasksGenerate(
  tenantId: number,
  warehouseId: number,
): Promise<WmsReplenishmentTaskGenerateResult> {
  const res = await api.post<WmsReplenishmentTaskGenerateResult>(
    "/wms/replenishment/tasks/generate",
    {},
    { params: { tenant_id: tenantId, warehouse_id: warehouseId } },
  );
  return res.data;
}

export async function patchReplenishmentTaskExecute(
  tenantId: number,
  taskId: number,
  body: {
    from_location_id: number;
    quantity: number;
    packaging_type?: string;
    packaging_quantity?: number | null;
    wms_mode?: string | null;
  },
): Promise<{ document: StockDocumentRead; task_completed: boolean }> {
  const res = await api.patch<{ document: StockDocumentRead; task_completed: boolean }>(
    `/wms/replenishment/tasks/${taskId}/execute`,
    body,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}
