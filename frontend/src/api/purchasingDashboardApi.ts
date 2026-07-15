import api from "./axios";

export type PurchasingKpis = {
  critical_products: number;
  out_of_stock_in_7_days: number;
  suggested_orders_count: number;
  suggested_purchase_value: number;
  active_suppliers: number;
  deliveries_in_pipeline: number;
};

export type CriticalProductRow = {
  product_id: number;
  product_name: string;
  sku?: string | null;
  image_url?: string | null;
  stock: number;
  avg_daily_sales: number;
  days_cover?: number | null;
  supplier_name?: string | null;
};

export type SuggestedOrderRow = {
  product_id: number;
  product_name: string;
  image_url?: string | null;
  suggested_qty: number;
  supplier_name?: string | null;
  buy_price?: number | null;
  estimated_cost: number;
};

export type RecentDeliveryRow = {
  id: number;
  document_no: string;
  supplier_name: string;
  status: string;
  created_at?: string | null;
};

export type PurchasingDashboardPayload = {
  kpis: PurchasingKpis;
  critical_products: CriticalProductRow[];
  suggested_orders: SuggestedOrderRow[];
  recent_orders: RecentDeliveryRow[];
};

export async function fetchPurchasingDashboard(params: {
  tenant_id: number;
  warehouse_id?: number | null;
}): Promise<PurchasingDashboardPayload> {
  const res = await api.get<PurchasingDashboardPayload>("/purchasing/dashboard", {
    params: {
      tenant_id: params.tenant_id,
      warehouse_id: params.warehouse_id ?? undefined,
    },
  });
  return res.data;
}
