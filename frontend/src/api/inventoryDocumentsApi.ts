import api from "./axios";
import type {
  InventoryDashboardPayload,
  InventoryDocumentRead,
  InventoryLineFocus,
  InventoryLineRead,
} from "./inventoryCountTypes";
import { tenantParams } from "./inventoryCountTypes";

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

export async function previewInventoryScope(
  tenantId: number,
  warehouseId: number,
  filters: Record<string, unknown>,
) {
  const { data } = await api.post<{
    scope_mode: string;
    location_count: number;
    product_count: number;
    line_count: number;
    warehouse_id: number;
  }>("/inventory-count/scope-preview", { warehouse_id: warehouseId, filters }, { params: { tenant_id: tenantId } });
  return data;
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
    surplus_value_net?: number;
    shortage_value_net?: number;
    lines: Array<Record<string, unknown>>;
  };
}

export async function startInventoryDocument(tenantId: number, documentId: number): Promise<InventoryDocumentRead> {
  const { data } = await api.post<InventoryDocumentRead>(
    `/inventory-count/documents/${documentId}/start`,
    {},
    { params: { tenant_id: tenantId } },
  );
  return data;
}
