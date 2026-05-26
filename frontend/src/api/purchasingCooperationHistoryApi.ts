import api from "./axios";

export type PurchasingCooperationSummary = {
  supplier_id: number;
  supplier_name: string;
  total_orders: number;
  total_receipts: number;
  first_order_date: string | null;
  last_delivery_date: string | null;
  avg_delivery_time: number | null;
  on_time_percent: number | null;
  total_net_spend: number;
  price_trend: number | null;
};

export type PurchasingCooperationDocRow = {
  doc_type: "PO" | "PZ" | string;
  document_no: string;
  date: string | null;
  status: string | null;
  supplier_name: string;
  total_net: number | null;
  total_gross: number | null;
};

export type PurchasingCooperationHistoryPayload = {
  summary: PurchasingCooperationSummary;
  recent_documents: PurchasingCooperationDocRow[];
};

export async function fetchPurchasingCooperationHistory(params: {
  tenantId: number;
  supplierId: number;
  limitDocs?: number;
}): Promise<PurchasingCooperationHistoryPayload> {
  const res = await api.get<PurchasingCooperationHistoryPayload>("/purchasing/cooperation-history", {
    params: {
      tenant_id: params.tenantId,
      supplier_id: params.supplierId,
      limit_docs: params.limitDocs ?? 20,
    },
  });
  return res.data;
}
