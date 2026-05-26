import api from "./axios";

export type SupplierAnalyticsRow = {
  rank: number;
  supplier_id: number;
  supplier_name: string;
  score: number | null;
  insufficient_data: boolean;
  active_products_count: number;
  total_orders: number;
  total_value: number;
  deliveries_count: number;
  planned_orders_count: number;
  total_purchase_value_net: number;
  total_purchase_value_gross: number;
  avg_delivery_interval: number | null;
  on_time_rate: number | null;
  price_trend: number | null;
  avg_lead_time_days: number | null;
  declared_lead_time_days: number | null;
  on_time_percent: number | null;
  avg_delay_days: number | null;
  partial_delivery_percent: number | null;
  cancelled_orders_count: number;
  avg_buy_price_change_percent: number | null;
  last_delivery_date: string | null;
  risk_level: string;
};

export type SupplierAnalyticsSeries = {
  score_trend: { period: string; score: number | null }[];
  punctuality_trend: { period: string; on_time_percent: number | null }[];
  order_history: { period: string; orders: number; value: number }[];
  supplier_id: number;
  supplier_name: string;
};

export type PurchasingSupplierAnalyticsPayload = {
  range_days: number;
  rows: SupplierAnalyticsRow[];
  series: SupplierAnalyticsSeries | null;
};

export async function fetchPurchasingSupplierAnalytics(params: {
  tenantId: number;
  supplierId?: number | null;
  rangeDays: 30 | 90 | 365;
}): Promise<PurchasingSupplierAnalyticsPayload> {
  const res = await api.get<PurchasingSupplierAnalyticsPayload>("/purchasing/suppliers/analytics", {
    params: {
      tenant_id: params.tenantId,
      supplier_id: params.supplierId ?? undefined,
      range_days: params.rangeDays,
    },
  });
  return res.data;
}
