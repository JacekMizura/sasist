import api from "./axios";
import { getApiErrorMessage } from "../utils/apiError";
import type {
  InventoryExecutionSummary,
  InventoryTaskCompact,
  InventoryTaskPage,
  InventoryTaskRead,
  InventoryUniversalSearchResult,
  ResolveLocationScanResult,
  TaskQueueQuery,
  WmsActiveInventoryDocumentRead,
  WmsBarcodeResolveErrorCode,
  WmsBarcodeResolveResult,
  WmsCarrierResolveResult,
  WmsTaskLineRead,
} from "./inventoryCountTypes";

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

export async function resolveWmsInventoryBarcode(
  tenantId: number,
  taskId: number,
  barcodeValue: string,
  carrierId?: number | null,
): Promise<WmsBarcodeResolveResult> {
  try {
    const { data } = await api.post<WmsBarcodeResolveResult>(
      `/wms/inventory-count/tasks/${taskId}/resolve-barcode`,
      null,
      {
        params: {
          tenant_id: tenantId,
          barcode_value: barcodeValue,
          ...(carrierId != null ? { carrier_id: carrierId } : {}),
        },
      },
    );
    return data;
  } catch (err) {
    throw parseWmsBarcodeResolveError(err, barcodeValue);
  }
}

export async function resolveWmsInventoryCarrier(
  tenantId: number,
  code: string,
): Promise<WmsCarrierResolveResult> {
  const { data } = await api.post<WmsCarrierResolveResult>(`/wms/inventory-count/resolve-carrier`, null, {
    params: { tenant_id: tenantId, code },
  });
  return data;
}

export async function fetchWmsTaskLines(tenantId: number, taskId: number): Promise<WmsTaskLineRead[]> {
  const { data } = await api.get<WmsTaskLineRead[]>(`/wms/inventory-count/tasks/${taskId}/lines`, {
    params: { tenant_id: tenantId },
  });
  return data;
}

export async function fetchWmsActiveInventoryDocuments(
  tenantId: number,
  warehouseId: number,
): Promise<WmsActiveInventoryDocumentRead[]> {
  const { data } = await api.get<WmsActiveInventoryDocumentRead[]>("/wms/inventory-count/active-documents", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
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
  body: {
    line_id: number;
    quantity?: number;
    delta?: number;
    barcode_value?: string;
    source?: string;
    carrier_id?: number | null;
  },
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

export type {
  InventoryTaskRead,
  InventoryTaskCompact,
  InventoryTaskPage,
  InventoryUniversalSearchResult,
  ResolveLocationScanResult,
  WmsActiveInventoryDocumentRead,
  WmsBarcodeResolveResult,
  WmsCarrierResolveResult,
  WmsTaskLineRead,
  InventoryExecutionSummary,
  TaskQueueQuery,
};
