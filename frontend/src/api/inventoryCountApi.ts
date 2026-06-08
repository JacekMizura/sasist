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
