import api from "./axios";

export type ForecastSummary = {
  products_analyzed: number;
  total_monthly_sales: number;
  total_stock_value: number;
  avg_stock_cover_days: number | null;
  risk_products_count: number;
  dead_stock_count: number;
};

export type SalesTrendPoint = { date: string; qty: number; revenue: number };
export type TopFastMoving = { product_id: number; name: string; qty_30d: number };
export type TopRiskProduct = {
  product_id: number;
  name: string;
  stock: number;
  avg_daily_sales: number;
  cover_days: number | null;
};
export type DeadStockRow = {
  product_id: number;
  name: string;
  stock: number;
  no_sales_days: number;
  stock_value: number;
};

export type LocationStockRow = { warehouse_name: string; location_name: string; qty: number };

export type ProductForecastDetail = {
  product: { id: number; name: string; sku?: string | null; ean?: string | null; image_url?: string | null };
  stock: number;
  sales_7d: number;
  sales_30d: number;
  sales_90d: number;
  avg_daily: number;
  suggested_qty: number;
  lead_time_days?: number | null;
  supplier_name?: string | null;
  forecast_30d: number;
  trend_percent?: number | null;
  unit?: string | null;
  locations?: LocationStockRow[];
  last_delivery_at?: string | null;
  last_purchase_price?: number | null;
  purchase_unit_net_eur?: number | null;
  purchase_unit_net_pln?: number | null;
  landed_cost_net?: number | null;
  extra_cost_net?: number | null;
  sale_pln_gross?: number | null;
  margin_percent?: number | null;
};

export type PurchasingForecastPayload = {
  summary: ForecastSummary;
  charts: {
    sales_trend: SalesTrendPoint[];
    top_fast_moving: TopFastMoving[];
    top_risk_products: TopRiskProduct[];
    dead_stock: DeadStockRow[];
  };
  product_detail: ProductForecastDetail | null;
};

export async function fetchPurchasingForecast(params: {
  tenant_id: number;
  warehouse_id?: number | null;
  product_id?: number | null;
  supplier_id?: number | null;
  range_days: 30 | 90 | 365;
}): Promise<PurchasingForecastPayload> {
  const res = await api.get<PurchasingForecastPayload>("/purchasing/forecast", {
    params: {
      tenant_id: params.tenant_id,
      warehouse_id: params.warehouse_id ?? undefined,
      product_id: params.product_id ?? undefined,
      supplier_id: params.supplier_id ?? undefined,
      range_days: params.range_days,
    },
  });
  return res.data;
}
