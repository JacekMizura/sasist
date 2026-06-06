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
  vat: number;
  payment_method: string | null;
  payment_status: string | null;
  paid: boolean;
  panel_document_type: string;
  document_subtype: string | null;
  detail_path: string;
};

export type SaleDocumentVatRow = {
  vat_percent: number;
  net: number;
  vat: number;
  gross: number;
};

export type SaleDocumentLine = {
  order_item_id: number;
  product_id: number;
  name: string;
  sku: string | null;
  quantity: number;
  unit_net: number | null;
  unit_gross: number | null;
  vat_percent: number;
  line_net: number;
  line_vat: number;
  line_gross: number;
};

export type SaleDocumentDetail = {
  id: string;
  document_number: string;
  document_type_id: string;
  document_series_id: string;
  document_subtype: string;
  panel_document_type: string;
  doc_type: string;
  order_id: number;
  order_number: string;
  warehouse_name: string | null;
  created_at: string | null;
  currency: string;
  total_net: number;
  total_gross: number;
  total_vat: number;
  lines: SaleDocumentLine[];
  vat_rows: SaleDocumentVatRow[];
  buyer: { name: string; nip?: string | null; city?: string | null };
  seller: { name: string; nip?: string | null };
  payment: {
    method: string | null;
    status: string | null;
    amount: number;
    currency: string;
    captured_at: string | null;
    external_transaction_id: string | null;
    transactions: Array<{
      id: number;
      method: string;
      amount: number;
      status: string;
    }>;
  };
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

export async function getSaleDocument(params: {
  tenantId: number;
  documentId: string;
}): Promise<SaleDocumentDetail> {
  const { data } = await api.get<SaleDocumentDetail>(`/sale-documents/${encodeURIComponent(params.documentId)}`, {
    params: { tenant_id: params.tenantId },
  });
  return data;
}
