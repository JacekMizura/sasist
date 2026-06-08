import api from "./axios";
import { getApiErrorMessage } from "../utils/apiError";

export type InventorySubmitReadiness = {
  can_submit: boolean;
  block_code?: string | null;
  block_message?: string | null;
  details?: Record<string, unknown>;
};

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
  submit_readiness?: InventorySubmitReadiness | null;
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
  difference_stats?: Record<string, number>;
  heatmap_preview?: Array<Record<string, unknown>>;
  operator_activity?: Array<Record<string, unknown>>;
  dashboard_status?: string;
  failed_sections?: string[];
  section_errors?: Array<{
    section: string;
    error_type: string;
    message: string;
    traceback?: string | null;
  }>;
  schema_audit?: Record<string, unknown> | null;
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
  zone_code?: string | null;
  aisle_code?: string | null;
  line_count?: number;
  counted_line_count?: number;
  inventory_type?: string | null;
};

export type WmsTaskLineRead = {
  id: number;
  product_id: number | null;
  sku: string | null;
  ean: string | null;
  product_name: string | null;
  image_url?: string | null;
  counted_quantity: number | null;
  status: string;
};

export type InventoryTaskCompact = InventoryTaskRead & {
  assigned_user_id?: number | null;
  assigned_operator_name?: string | null;
  has_variance?: boolean;
  recount_flag?: boolean;
  unresolved?: boolean;
  last_activity_at?: string | null;
  aisle_code?: string | null;
};

export type InventoryTaskPage = {
  items: InventoryTaskCompact[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
};

export type InventoryUniversalSearchResult = {
  query: string;
  locations: Array<{
    location_id: number;
    location_code: string;
    zone?: string | null;
    aisle?: string | null;
    carrier_id?: number;
  }>;
  products: Array<{
    product_id: number;
    sku?: string | null;
    ean?: string | null;
    name?: string | null;
    catalog_number?: string | null;
    image_url?: string | null;
    locations?: string[];
    stock_hint?: string | null;
  }>;
  tasks: Array<{
    task_id: number;
    task_number: string;
    location_id: number;
    location_code?: string | null;
    status: string;
    progress_percent: number;
  }>;
};

export type ResolveLocationScanResult = {
  found: boolean;
  reason?: string;
  task_id?: number;
  location_id?: number;
  location_code?: string;
  inventory_document_id?: number;
  progress_percent?: number;
};

export type InventoryExecutionLine = {
  line_id?: number;
  product_id?: number;
  unknown_id?: number;
  sku?: string | null;
  ean?: string | null;
  product_name?: string | null;
  temporary_name?: string;
  counted_quantity?: number | null;
  expected_quantity?: number | null;
  difference_quantity?: number | null;
  quantity?: number;
  status?: string;
  category?: string;
  variance_severity?: string;
  variance_message?: string;
};

export type InventoryExecutionSummary = {
  task_id: number;
  location_id: number;
  location_code: string | null;
  blind_mode: boolean;
  progress_percent: number;
  line_count: number;
  counted_line_count: number;
  pending: InventoryExecutionLine[];
  counted: InventoryExecutionLine[];
  variance: InventoryExecutionLine[];
  unexpected: InventoryExecutionLine[];
};

export type TaskQueueQuery = {
  documentId?: number;
  zone?: string;
  status?: string;
  recountOnly?: boolean;
  unresolvedOnly?: boolean;
  varianceOnly?: boolean;
  completedOnly?: boolean;
  search?: string;
  offset?: number;
  limit?: number;
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
  product_image_url?: string | null;
  expected_quantity: number | null;
  counted_quantity: number | null;
  difference_quantity: number | null;
  difference_class?: string | null;
  status: string;
  batch_number: string | null;
  serial_number: string | null;
  recount_count: number;
  carrier_id?: number | null;
  carrier_code?: string | null;
  last_counted_at?: string | null;
  last_counted_by_user_id?: number | null;
  last_counted_by_name?: string | null;
};

export type InventoryLineFocus = "operational" | "all" | "differences" | "uncounted";

export type InventoryAuditLineContext = {
  line_id?: number;
  product_id?: number | null;
  product_name?: string | null;
  sku?: string | null;
  ean?: string | null;
  product_image_url?: string | null;
  location_id?: number | null;
  location_name?: string | null;
};

export type InventoryAuditEventRead = {
  id: number;
  action: string;
  user_id: number | null;
  user_name?: string | null;
  inventory_document_line_id?: number | null;
  session_id?: number | null;
  device_id?: string | null;
  detail?: unknown;
  previous_state?: unknown;
  next_state?: unknown;
  line_context?: InventoryAuditLineContext | null;
  location_name?: string | null;
  created_at: string | null;
};

export type InventoryDocumentTimelines = {
  document_id: number;
  approval_timeline: Array<{
    id: number;
    action: string;
    user_id: number | null;
    user_name?: string | null;
    notes: string | null;
    created_at: string | null;
  }>;
  recount_timeline: Array<{
    id: number;
    status: string;
    line_id: number;
    assigned_user_id: number | null;
    assigned_user_name?: string | null;
    completed_by_user_name?: string | null;
    reason: string | null;
    created_at: string | null;
    completed_at: string | null;
    line_context?: InventoryAuditLineContext | null;
  }>;
  posting_timeline: InventoryAuditEventRead[];
};

export async function listDocumentLines(
  tenantId: number,
  documentId: number,
  opts?: { focus?: InventoryLineFocus; limit?: number },
): Promise<InventoryLineRead[]> {
  const { data } = await api.get<{ items: InventoryLineRead[]; total: number }>(
    `/inventory-count/documents/${documentId}/lines`,
    {
      params: {
        tenant_id: tenantId,
        supervisor: true,
        focus: opts?.focus ?? "operational",
        limit: opts?.limit ?? 2000,
      },
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

export type WmsDiscrepancyClass =
  | "EXPECTED"
  | "EXTRA_PRODUCT"
  | "UNPLANNED_PRODUCT"
  | "WRONG_LOCATION"
  | "UNKNOWN_PRODUCT";

export type WmsBarcodeResolveResult = {
  line_id: number;
  product_id: number;
  product_name: string | null;
  sku: string | null;
  ean: string | null;
  barcode: string;
  image_url?: string | null;
  expected_quantity: number;
  counted_quantity: number;
  difference_quantity?: number | null;
  discrepancy_class: WmsDiscrepancyClass;
  discrepancy_label: string;
  location_id: number;
  location_code?: string | null;
  line_created?: boolean;
};

export type WmsRecentScanEntry = WmsBarcodeResolveResult & {
  scanned_at: string;
  scan_delta?: number;
};

export type WmsBarcodeResolveErrorCode =
  | "barcode_not_found"
  | "line_not_found_for_barcode"
  | "barcode_ambiguous"
  | "task_not_found"
  | "unknown";

export class WmsBarcodeResolveError extends Error {
  code: WmsBarcodeResolveErrorCode;
  barcode?: string;

  constructor(code: WmsBarcodeResolveErrorCode, message: string, barcode?: string) {
    super(message);
    this.name = "WmsBarcodeResolveError";
    this.code = code;
    this.barcode = barcode;
  }
}

function parseWmsBarcodeResolveError(err: unknown, fallbackBarcode?: string): WmsBarcodeResolveError {
  const axiosErr = err as { response?: { status?: number; data?: { detail?: Record<string, unknown> } } };
  const detail = axiosErr.response?.data?.detail;
  if (detail && typeof detail === "object") {
    const codeRaw = (detail.error ?? detail.code) as string | undefined;
    const barcode = (detail.barcode as string | undefined) ?? fallbackBarcode;
    const message = (detail.message as string | undefined) ?? getApiErrorMessage(err);
    if (codeRaw === "barcode_not_found") {
      return new WmsBarcodeResolveError("barcode_not_found", "Nie znaleziono produktu dla kodu", barcode);
    }
    if (codeRaw === "line_not_found_for_barcode") {
      return new WmsBarcodeResolveError(
        "line_not_found_for_barcode",
        "Produkt rozpoznany, brak pozycji w tej lokalizacji",
        barcode,
      );
    }
    if (codeRaw === "barcode_ambiguous") {
      return new WmsBarcodeResolveError("barcode_ambiguous", "Kod pasuje do wielu produktów — użyj wyszukiwania awaryjnego", barcode);
    }
    if (codeRaw === "task_not_found") {
      return new WmsBarcodeResolveError("task_not_found", "Zadanie nie istnieje", barcode);
    }
  }
  if (axiosErr.response?.status === 404) {
    return new WmsBarcodeResolveError("barcode_not_found", "Nie znaleziono produktu dla kodu", fallbackBarcode);
  }
  return new WmsBarcodeResolveError("unknown", getApiErrorMessage(err) || "Nie rozpoznano kodu", fallbackBarcode);
}

export async function resolveWmsInventoryBarcode(
  tenantId: number,
  taskId: number,
  barcodeValue: string,
): Promise<WmsBarcodeResolveResult> {
  try {
    const { data } = await api.post<WmsBarcodeResolveResult>(
      `/wms/inventory-count/tasks/${taskId}/resolve-barcode`,
      null,
      {
        params: { tenant_id: tenantId, barcode_value: barcodeValue },
      },
    );
    return data;
  } catch (err) {
    throw parseWmsBarcodeResolveError(err, barcodeValue);
  }
}

export async function fetchWmsTaskLines(tenantId: number, taskId: number): Promise<WmsTaskLineRead[]> {
  const { data } = await api.get<WmsTaskLineRead[]>(`/wms/inventory-count/tasks/${taskId}/lines`, {
    params: { tenant_id: tenantId },
  });
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

export type InventoryApprovalActionResult = {
  status: string;
  analysis?: unknown;
  recounts_created?: number;
  approved_at?: string | null;
};

export async function submitInventoryDocumentForApproval(
  tenantId: number,
  documentId: number,
  notes?: string | null,
): Promise<InventoryApprovalActionResult> {
  const { data } = await api.post<InventoryApprovalActionResult>(
    `/inventory-count/documents/${documentId}/submit-approval`,
    { notes: notes ?? null },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function approveInventoryDocument(
  tenantId: number,
  documentId: number,
  notes?: string | null,
): Promise<InventoryApprovalActionResult> {
  const { data } = await api.post<InventoryApprovalActionResult>(
    `/inventory-count/documents/${documentId}/approve`,
    { notes: notes ?? null },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function rejectInventoryDocument(
  tenantId: number,
  documentId: number,
  notes?: string | null,
): Promise<InventoryApprovalActionResult> {
  const { data } = await api.post<InventoryApprovalActionResult>(
    `/inventory-count/documents/${documentId}/reject`,
    { notes: notes ?? null },
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function postInventoryDocumentAdjustments(
  tenantId: number,
  documentId: number,
): Promise<InventoryApprovalActionResult> {
  const { data } = await api.post<InventoryApprovalActionResult>(
    `/inventory-count/documents/${documentId}/post`,
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

export async function resolveWmsInventoryLocationScan(
  tenantId: number,
  warehouseId: number,
  code: string,
  documentId?: number,
): Promise<ResolveLocationScanResult> {
  const { data } = await api.get<ResolveLocationScanResult>("/wms/inventory-count/resolve-location", {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      code,
      ...(documentId != null ? { document_id: documentId } : {}),
    },
  });
  return data;
}

export async function fetchWmsInventoryTaskQueue(
  tenantId: number,
  warehouseId: number,
  query: TaskQueueQuery = {},
): Promise<InventoryTaskPage> {
  const { data } = await api.get<InventoryTaskPage>("/wms/inventory-count/tasks/queue", {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      ...(query.documentId != null ? { document_id: query.documentId } : {}),
      ...(query.search ? { search: query.search } : {}),
      offset: query.offset ?? 0,
      limit: query.limit ?? 50,
    },
  });
  return data;
}

export async function searchWmsInventory(
  tenantId: number,
  warehouseId: number,
  q: string,
  documentId?: number,
): Promise<InventoryUniversalSearchResult> {
  const { data } = await api.get<InventoryUniversalSearchResult>("/wms/inventory-count/search", {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      q,
      ...(documentId != null ? { document_id: documentId } : {}),
    },
  });
  return data;
}

export async function fetchWmsExecutionSummary(tenantId: number, taskId: number): Promise<InventoryExecutionSummary> {
  const { data } = await api.get<InventoryExecutionSummary>(
    `/wms/inventory-count/tasks/${taskId}/execution-summary`,
    { params: { tenant_id: tenantId } },
  );
  return data;
}

export async function searchWmsTaskProducts(tenantId: number, taskId: number, q: string) {
  const { data } = await api.get<{
    matches: Array<{
      line_id: number;
      product_id: number;
      product_name: string | null;
      sku: string | null;
      ean: string | null;
      image_url?: string | null;
      counted_quantity: number | null;
      status: string;
    }>;
  }>(`/wms/inventory-count/tasks/${taskId}/search-products`, {
    params: { tenant_id: tenantId, q },
  });
  return data.matches ?? [];
}

export async function createWmsUnknownProduct(
  tenantId: number,
  warehouseId: number,
  body: {
    document_id: number;
    task_id?: number;
    location_id: number;
    temporary_name: string;
    quantity?: number;
    barcode_value?: string;
    notes?: string;
    photo_url?: string;
  },
  sessionId?: number,
) {
  const { data } = await api.post("/wms/inventory-count/unknown-products", body, {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      ...(sessionId != null ? { session_id: sessionId } : {}),
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

export async function fetchInventoryAuditLog(tenantId: number, documentId: number, limit = 200) {
  const { data } = await api.get<{ items: InventoryAuditEventRead[]; total: number }>(
    `/inventory-count/documents/${documentId}/audit-log`,
    { params: { tenant_id: tenantId, limit } },
  );
  return data;
}

export async function fetchInventoryDocumentTimelines(tenantId: number, documentId: number) {
  const { data } = await api.get<InventoryDocumentTimelines>(`/inventory-count/documents/${documentId}/timelines`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function downloadInventoryReportBlob(
  tenantId: number,
  documentId: number,
  reportKind: string,
  format: "xlsx" | "pdf" = "xlsx",
): Promise<{ blob: Blob; fileName: string }> {
  const { parseBlobErrorMessage, resolveDownloadFilename } = await import(
    "../modules/inventoryCount/erp/downloadHelpers"
  );
  const response = await api.get<Blob>(`/inventory-count/documents/${documentId}/reports/${reportKind}`, {
    params: { tenant_id: tenantId, format },
    responseType: "blob",
  });
  const blob = response.data;
  const ct = (blob.type || "").toLowerCase();
  if (ct.includes("json") || ct.includes("text/html")) {
    throw new Error(await parseBlobErrorMessage(blob));
  }
  const fileName = resolveDownloadFilename(
    response.headers as Record<string, string | undefined>,
    `inv_${documentId}_${reportKind}.${format}`,
  );
  return { blob, fileName };
}

export async function downloadInventoryAuditPackageBlob(
  tenantId: number,
  documentId: number,
): Promise<{ blob: Blob; fileName: string }> {
  const { parseBlobErrorMessage, resolveDownloadFilename } = await import(
    "../modules/inventoryCount/erp/downloadHelpers"
  );
  const response = await api.get<Blob>(`/inventory-count/documents/${documentId}/audit-package`, {
    params: { tenant_id: tenantId },
    responseType: "blob",
  });
  const blob = response.data;
  const ct = (blob.type || "").toLowerCase();
  if (ct.includes("json")) {
    throw new Error(await parseBlobErrorMessage(blob));
  }
  const fileName = resolveDownloadFilename(
    response.headers as Record<string, string | undefined>,
    `inv_${documentId}_audit.zip`,
  );
  return { blob, fileName };
}
