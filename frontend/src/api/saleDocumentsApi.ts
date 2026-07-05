import api from "./axios";
import { getApiErrorMessage } from "../utils/apiError";
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

export function saleDocumentPdfUrl(tenantId: number, documentId: string, templateVersionId?: number | null): string {
  const q = new URLSearchParams({ tenant_id: String(tenantId) });
  if (templateVersionId != null) q.set("template_version_id", String(templateVersionId));
  return `/api/sale-documents/${encodeURIComponent(documentId)}/pdf?${q}`;
}

export function stockDocumentPdfUrl(
  tenantId: number,
  stockDocumentId: number,
  templateVersionId?: number | null,
): string {
  const q = new URLSearchParams({ tenant_id: String(tenantId) });
  if (templateVersionId != null) q.set("template_version_id", String(templateVersionId));
  return `/api/stock-documents/${stockDocumentId}/pdf?${q}`;
}

async function parsePdfBlobError(blob: Blob): Promise<string> {
  try {
    const text = await blob.text();
    const parsed = JSON.parse(text) as { detail?: unknown };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail.trim();
    }
  } catch {
    /* not JSON */
  }
  return "Nie udało się wygenerować PDF dokumentu.";
}

async function assertPdfBlob(blob: Blob, context: string): Promise<Blob> {
  const ct = (blob.type || "").toLowerCase();
  if (ct.includes("json") || ct.includes("text")) {
    const msg = await parsePdfBlobError(blob);
    console.error(`[${context}]`, msg);
    throw new Error(msg);
  }
  if (blob.size < 5) {
    console.error(`[${context}] empty PDF response`);
    throw new Error("Nie udało się wygenerować PDF dokumentu.");
  }
  const head = await blob.slice(0, 4).text();
  if (!head.startsWith("%PDF")) {
    const msg = await parsePdfBlobError(blob);
    console.error(`[${context}] invalid PDF magic`, msg);
    throw new Error(msg);
  }
  return blob;
}

/** Authenticated PDF fetch — avoids SPA router 404 when opening print viewer. */
export async function fetchSaleDocumentPdfBlob(
  tenantId: number,
  documentId: string,
  templateVersionId?: number | null,
): Promise<Blob> {
  try {
    const params: Record<string, string | number> = { tenant_id: tenantId };
    if (templateVersionId != null) params.template_version_id = templateVersionId;
    const { data } = await api.get<Blob>(`/sale-documents/${encodeURIComponent(documentId)}/pdf`, {
      params,
      responseType: "blob",
    });
    return await assertPdfBlob(data, "sale-document-pdf");
  } catch (err) {
    const msg = getApiErrorMessage(err) || "Nie udało się wygenerować PDF dokumentu.";
    console.error("[sale-document-pdf]", msg, err);
    throw new Error(msg);
  }
}

export async function fetchStockDocumentPdfBlob(
  tenantId: number,
  stockDocumentId: number,
  templateVersionId?: number | null,
): Promise<Blob> {
  try {
    const params: Record<string, string | number> = { tenant_id: tenantId };
    if (templateVersionId != null) params.template_version_id = templateVersionId;
    const { data } = await api.get<Blob>(`/stock-documents/${stockDocumentId}/pdf`, {
      params,
      responseType: "blob",
    });
    return await assertPdfBlob(data, "stock-document-pdf");
  } catch (err) {
    const msg = getApiErrorMessage(err) || "Nie udało się wygenerować PDF dokumentu.";
    console.error("[stock-document-pdf]", msg, err);
    throw new Error(msg);
  }
}
