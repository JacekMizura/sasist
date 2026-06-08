import api from "./axios";
import type { InventoryAuditEventRead, InventoryDocumentTimelines } from "./inventoryCountTypes";

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

export type { InventoryAuditEventRead, InventoryDocumentTimelines };
