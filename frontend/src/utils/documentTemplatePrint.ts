import api from "../api/axios";
import {
  fetchPublishedTemplateOptions,
  type PublishedTemplateOptionDto,
} from "../api/documentTemplatesApi";
import { getApiErrorMessage } from "./apiError";
import { openPdfBlobInPrintViewer } from "./openPdfForBrowserPrint";

export type DocumentPrintRequest =
  | { kind: "order_confirmation"; orderId: number }
  | { kind: "picking_list"; orderId: number }
  | { kind: "return_document"; orderId: number }
  | { kind: "product_card"; productId: number }
  | { kind: "sale_document"; documentId: string; kindCode: string }
  | { kind: "stock_document"; documentId: number; kindCode: string }
  | { kind: "supplier_order"; orderId: number };

export function kindCodeForPrintRequest(req: DocumentPrintRequest): string {
  if (req.kind === "sale_document" || req.kind === "stock_document") {
    return req.kindCode;
  }
  if (req.kind === "supplier_order") return "supplier_order";
  return req.kind;
}

function pdfPath(tenantId: number, req: DocumentPrintRequest, templateVersionId?: number | null): string {
  const q = new URLSearchParams({ tenant_id: String(tenantId) });
  if (templateVersionId != null) q.set("template_version_id", String(templateVersionId));

  switch (req.kind) {
    case "order_confirmation":
      return `/orders/${req.orderId}/confirmation.pdf?${q}`;
    case "picking_list":
      return `/orders/${req.orderId}/picking-list.pdf?${q}`;
    case "return_document":
      return `/orders/${req.orderId}/return-document.pdf?${q}`;
    case "product_card":
      return `/products/${req.productId}/product-card.pdf?${q}`;
    case "sale_document":
      return `/sale-documents/${encodeURIComponent(req.documentId)}/pdf?${q}`;
    case "stock_document":
      return `/stock-documents/${req.documentId}/pdf?${q}`;
    case "supplier_order":
      return `/supplier-orders/${req.orderId}/pdf?${q}`;
    default:
      throw new Error("Nieobsługiwany typ druku.");
  }
}

async function assertPdfBlob(blob: Blob, context: string): Promise<Blob> {
  const ct = (blob.type || "").toLowerCase();
  if (ct.includes("json") || ct.includes("text")) {
    try {
      const parsed = JSON.parse(await blob.text()) as { detail?: unknown };
      if (typeof parsed.detail === "string" && parsed.detail.trim()) {
        throw new Error(parsed.detail.trim());
      }
    } catch (e) {
      if (e instanceof Error && e.message !== "Unexpected token") throw e;
    }
    throw new Error("Nie udało się wygenerować PDF dokumentu.");
  }
  if (blob.size < 5) throw new Error("Nie udało się wygenerować PDF dokumentu.");
  const head = await blob.slice(0, 4).text();
  if (!head.startsWith("%PDF")) {
    throw new Error("Nie udało się wygenerować PDF dokumentu.");
  }
  return blob;
}

export async function fetchDocumentPrintPdfBlob(
  tenantId: number,
  req: DocumentPrintRequest,
  templateVersionId?: number | null,
): Promise<Blob> {
  try {
    const { data } = await api.get<Blob>(pdfPath(tenantId, req, templateVersionId), { responseType: "blob" });
    return await assertPdfBlob(data, "document-template-print");
  } catch (err) {
    const msg = getApiErrorMessage(err) || "Nie udało się wygenerować PDF dokumentu.";
    console.error("[document-template-print]", msg, err);
    throw new Error(msg);
  }
}

export async function printDocumentPdf(
  tenantId: number,
  req: DocumentPrintRequest,
  templateVersionId?: number | null,
  options?: { autoPrint?: boolean },
): Promise<void> {
  const blob = await fetchDocumentPrintPdfBlob(tenantId, req, templateVersionId);
  openPdfBlobInPrintViewer(blob, { autoPrint: options?.autoPrint ?? true });
}

export type TemplatePickerState = {
  kindCode: string;
  request: DocumentPrintRequest;
  options: PublishedTemplateOptionDto[];
};

export async function resolveTemplatePickerState(
  tenantId: number,
  req: DocumentPrintRequest,
): Promise<TemplatePickerState | null> {
  const kindCode = kindCodeForPrintRequest(req);
  const options = await fetchPublishedTemplateOptions(tenantId, { kind_code: kindCode });
  if (options.length <= 1) return null;
  return { kindCode, request: req, options };
}

export async function printWithTemplateResolution(
  tenantId: number,
  req: DocumentPrintRequest,
  onMultipleTemplates: (state: TemplatePickerState) => void,
  options?: { autoPrint?: boolean },
): Promise<"printed" | "picker"> {
  const kindCode = kindCodeForPrintRequest(req);
  const published = await fetchPublishedTemplateOptions(tenantId, { kind_code: kindCode });
  if (published.length > 1) {
    onMultipleTemplates({ kindCode, request: req, options: published });
    return "picker";
  }
  const versionId = published.length === 1 ? published[0]!.version_id : null;
  await printDocumentPdf(tenantId, req, versionId, options);
  return "printed";
}

/** Map sale/warehouse document subtype to DTE kind code. */
export function saleKindFromSubtype(subtype: string | null | undefined): string {
  const s = String(subtype ?? "").trim().toUpperCase();
  if (s === "INVOICE" || s === "FV") return "invoice";
  if (s === "RECEIPT" || s === "PA" || s === "PARAGON") return "receipt";
  if (s === "CORRECTION" || s === "KOR") return "correction";
  return "invoice";
}

export function stockKindFromType(docType: string | null | undefined): string {
  const s = String(docType ?? "WZ").trim().toUpperCase();
  if (s === "PZ") return "pz";
  if (s === "PW") return "pw";
  if (s === "RW") return "rw";
  if (s === "MM") return "mm";
  return "wz";
}

type OrderLinkedDocumentDto = {
  kind?: string | null;
  document_type?: string | null;
  stock_document_id?: number | null;
  id?: string | number | null;
};

/** Resolve WZ stock documents for bulk order print (one WZ per order). */
export async function resolveOrderWzBulkPrintRequests(orderIds: number[]): Promise<DocumentPrintRequest[]> {
  const requests: DocumentPrintRequest[] = [];
  const missing: number[] = [];

  await Promise.all(
    orderIds.map(async (orderId) => {
      const { data } = await api.get<{ linked_documents?: OrderLinkedDocumentDto[] }>(`/orders/${orderId}/`);
      const linked = data.linked_documents ?? [];
      const wzDocs = linked.filter((d) => d.kind === "warehouse" || d.document_type === "WZ");
      const doc = wzDocs[0];
      const stockId = doc?.stock_document_id ?? Number(doc?.id);
      if (doc && Number.isFinite(stockId) && stockId > 0) {
        requests.push({
          kind: "stock_document",
          documentId: Number(stockId),
          kindCode: stockKindFromType(doc.document_type),
        });
      } else {
        missing.push(orderId);
      }
    }),
  );

  if (missing.length > 0) {
    throw new Error(`Brak WZ dla zamówień: ${missing.join(", ")}`);
  }
  return requests.sort((a, b) => {
    if (a.kind !== "stock_document" || b.kind !== "stock_document") return 0;
    return a.documentId - b.documentId;
  });
}
