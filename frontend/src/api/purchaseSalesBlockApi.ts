import api from "./axios";
import type { StockDocumentRead } from "./stockDocumentsApi";

export const SALES_BLOCK_REASON_OPTIONS = [
  { value: "PRICE_DISPUTE", label: "Spór cenowy" },
  { value: "VAT_DISPUTE", label: "Spór VAT" },
  { value: "MISSING_INVOICE", label: "Brak faktury" },
  { value: "PURCHASE_REVIEW", label: "Oczekiwanie na akceptację zakupów" },
  { value: "OTHER", label: "Inne" },
] as const;

export type SalesBlockReasonCode = (typeof SALES_BLOCK_REASON_OPTIONS)[number]["value"];

export type PatchPurchaseSalesBlockBody = {
  sales_blocked_qty?: number;
  sales_block_reason_code?: SalesBlockReasonCode | null;
  sales_block_note?: string | null;
};

export async function patchPurchaseLineSalesBlock(
  tenantId: number,
  documentId: number,
  lineId: number,
  body: PatchPurchaseSalesBlockBody,
): Promise<StockDocumentRead> {
  const res = await api.patch<StockDocumentRead>(
    `/stock-documents/${documentId}/lines/${lineId}/sales-block`,
    body,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}
