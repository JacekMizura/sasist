import api from "./axios";
import type { SaleDocumentDetail, SaleDocumentListRow } from "../types/saleDocument";

export type { SaleDocumentDetail, SaleDocumentListRow } from "../types/saleDocument";

export async function listSaleDocuments(params: {
  tenantId: number;
  warehouseId?: number;
  panelDocumentType?: "PARAGON" | "INVOICE";
  limit?: number;
}): Promise<SaleDocumentListRow[]> {
  const { data } = await api.get<{ items?: SaleDocumentListRow[] }>("/sale-documents/", {
    params: {
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId,
      panel_document_type: params.panelDocumentType,
      limit: params.limit ?? 200,
    },
  });
  return Array.isArray(data?.items) ? data.items : [];
}

export async function getSaleDocument(params: {
  tenantId: number;
  documentId: string;
}): Promise<SaleDocumentDetail> {
  const { data } = await api.get<SaleDocumentDetail>(`/sale-documents/${encodeURIComponent(params.documentId)}`, {
    params: { tenant_id: params.tenantId },
  });
  return data;
}

export function saleDocumentPdfUrl(tenantId: number, documentId: string): string {
  return `/api/sale-documents/${encodeURIComponent(documentId)}/pdf?tenant_id=${tenantId}`;
}

export function stockDocumentPdfUrl(tenantId: number, stockDocumentId: number): string {
  return `/api/stock-documents/${stockDocumentId}/pdf?tenant_id=${tenantId}`;
}

/** Authenticated PDF fetch — avoids SPA router 404 when opening print viewer. */
export async function fetchSaleDocumentPdfBlob(tenantId: number, documentId: string): Promise<Blob> {
  const { data } = await api.get<Blob>(`/sale-documents/${encodeURIComponent(documentId)}/pdf`, {
    params: { tenant_id: tenantId },
    responseType: "blob",
  });
  return data;
}

export async function fetchStockDocumentPdfBlob(tenantId: number, stockDocumentId: number): Promise<Blob> {
  const { data } = await api.get<Blob>(`/stock-documents/${stockDocumentId}/pdf`, {
    params: { tenant_id: tenantId },
    responseType: "blob",
  });
  return data;
}
