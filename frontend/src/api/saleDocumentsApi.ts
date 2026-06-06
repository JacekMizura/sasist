import api from "./axios";

export type SaleDocumentListRow = {
  id: string;
  order_id: number;
  order_number: string | null;
  client: string;
  series: string;
  doc_type: string;
  document_number: string;
  date: string | null;
  net: number;
  gross: number;
  panel_document_type: string;
  source: string | null;
};

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
