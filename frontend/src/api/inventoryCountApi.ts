import api from "./axios";

export type InventoryDocumentRead = {
  id: number;
  tenant_id: number;
  warehouse_id: number;
  number: string;
  inventory_type: string;
  status: string;
  count_mode: string;
  lock_mode: string;
  recount_required: boolean;
  scan_mode: string;
  filters: Record<string, unknown>;
  strategy: Record<string, unknown>;
  metadata: Record<string, unknown>;
  notes: string | null;
  total_lines: number;
  counted_lines: number;
  difference_lines: number;
  coverage_percent: number;
  snapshot_created_at: string | null;
  updated_at: string | null;
};

export type InventoryDashboardPayload = {
  kpis: {
    active_inventories: number;
    awaiting_approval: number;
    open_differences: number;
    completed_last_7_days: number;
    warehouse_coverage_percent: number;
    active_operator_sessions: number;
  };
  active_inventories: InventoryDocumentRead[];
  awaiting_approval: InventoryDocumentRead[];
  recent_completed: InventoryDocumentRead[];
};

export type InventoryTaskRead = {
  id: number;
  inventory_document_id: number;
  warehouse_id: number;
  location_id: number;
  location_code: string | null;
  location_name: string | null;
  task_number: string;
  status: string;
  priority: number;
  progress_percent: number;
  sequence_no: number;
};

const tenantParams = (tenantId: number, warehouseId?: number | null) => ({
  tenant_id: tenantId,
  ...(warehouseId != null ? { warehouse_id: warehouseId } : {}),
});

export async function fetchInventoryCountDashboard(
  tenantId: number,
  warehouseId?: number | null,
): Promise<InventoryDashboardPayload> {
  const { data } = await api.get<InventoryDashboardPayload>("/inventory-count/dashboard", {
    params: tenantParams(tenantId, warehouseId),
  });
  return data;
}

export async function listInventoryDocuments(
  tenantId: number,
  opts?: { warehouseId?: number | null; status?: string },
): Promise<InventoryDocumentRead[]> {
  const { data } = await api.get<InventoryDocumentRead[]>("/inventory-count/documents", {
    params: {
      ...tenantParams(tenantId, opts?.warehouseId),
      ...(opts?.status ? { status: opts.status } : {}),
    },
  });
  return data;
}

export async function createInventoryDocument(
  tenantId: number,
  body: { warehouse_id: number; inventory_type?: string; notes?: string },
): Promise<InventoryDocumentRead> {
  const { data } = await api.post<InventoryDocumentRead>("/inventory-count/documents", body, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function updateInventoryWizard(
  tenantId: number,
  documentId: number,
  body: Record<string, unknown>,
): Promise<InventoryDocumentRead> {
  const { data } = await api.patch<InventoryDocumentRead>(
    `/inventory-count/documents/${documentId}/wizard`,
    body,
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function fetchInventoryDocument(tenantId: number, documentId: number): Promise<InventoryDocumentRead> {
  const { data } = await api.get<InventoryDocumentRead>(`/inventory-count/documents/${documentId}`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export type InventoryLineRead = {
  id: number;
  location_id: number;
  location_name: string | null;
  product_id: number;
  sku: string | null;
  ean: string | null;
  product_name: string | null;
  expected_quantity: number | null;
  counted_quantity: number | null;
  difference_quantity: number | null;
  status: string;
  batch_number: string | null;
  serial_number: string | null;
  recount_count: number;
};

export async function listDocumentLines(tenantId: number, documentId: number): Promise<InventoryLineRead[]> {
  const { data } = await api.get<{ items: InventoryLineRead[]; total: number }>(
    `/inventory-count/documents/${documentId}/lines`,
    {
      params: { tenant_id: tenantId, supervisor: true },
    },
  );
  return data.items ?? [];
}

export async function getDocumentDifferenceAnalysis(tenantId: number, documentId: number) {
  const { data } = await api.get(`/inventory-count/documents/${documentId}/differences`, {
    params: { tenant_id: tenantId },
  });
  return data as {
    document_id: number;
    thresholds: Record<string, number>;
    summary: Record<string, number>;
    total_value_impact_net: number;
    lines: Array<Record<string, unknown>>;
  };
}

export async function fetchWmsInventoryTask(tenantId: number, taskId: number): Promise<InventoryTaskRead> {
  const { data } = await api.get<InventoryTaskRead>(`/wms/inventory-count/tasks/${taskId}`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function confirmWmsInventoryLocation(
  tenantId: number,
  taskId: number,
  body: { location_id: number; scanned_code: string },
) {
  const { data } = await api.post(`/wms/inventory-count/tasks/${taskId}/confirm-location`, body, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function resolveWmsInventoryBarcode(tenantId: number, taskId: number, barcodeValue: string) {
  const { data } = await api.post<{
    line_id: number;
    product_id: number;
    product_name: string | null;
    sku: string | null;
    ean: string | null;
  }>(`/wms/inventory-count/tasks/${taskId}/resolve-barcode`, null, {
    params: { tenant_id: tenantId, barcode_value: barcodeValue },
  });
  return data;
}

export async function fetchWmsTaskLines(tenantId: number, taskId: number) {
  const { data } = await api.get(`/wms/inventory-count/tasks/${taskId}/lines`, {
    params: { tenant_id: tenantId },
  });
  return data as Array<{
    id: number;
    product_name: string | null;
    sku: string | null;
    counted_quantity: number | null;
    status: string;
  }>;
}

export async function startInventoryDocument(tenantId: number, documentId: number): Promise<InventoryDocumentRead> {
  const { data } = await api.post<InventoryDocumentRead>(
    `/inventory-count/documents/${documentId}/start`,
    {},
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function listWmsInventoryTasks(
  tenantId: number,
  warehouseId: number,
  documentId?: number,
): Promise<InventoryTaskRead[]> {
  const { data } = await api.get<InventoryTaskRead[]>("/wms/inventory-count/tasks", {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      ...(documentId != null ? { document_id: documentId } : {}),
    },
  });
  return data;
}

export async function openWmsInventorySession(
  tenantId: number,
  warehouseId: number,
  body: { document_id: number; task_id?: number; device_id?: string },
) {
  const { data } = await api.post("/wms/inventory-count/sessions", body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return data;
}

export async function recordInventoryScan(
  tenantId: number,
  documentId: number,
  body: { line_id: number; quantity?: number; delta?: number; barcode_value?: string },
  sessionId?: number,
) {
  const { data } = await api.post(`/wms/inventory-count/documents/${documentId}/scan`, body, {
    params: {
      tenant_id: tenantId,
      ...(sessionId != null ? { session_id: sessionId } : {}),
    },
  });
  return data;
}

export async function fetchInventoryReportsCatalog() {
  const { data } = await api.get<{ reports: { kind: string; label: string; formats: string[]; status: string }[] }>(
    "/inventory-count/reports/catalog",
  );
  return data;
}
