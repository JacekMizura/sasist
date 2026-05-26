import api from "./axios";

export type ProductProfitabilityRow = {
  product_id: number;
  image_url?: string | null;
  sku?: string | null;
  ean?: string | null;
  product_name: string;
  stock_qty: number;
  sold_qty: number;
  revenue_net: number;
  cost_of_goods: number;
  profit_value: number;
  margin_percent?: number | null;
  sale_gross?: number | null;
  landed_cost_net?: number | null;
  purchase_price?: number | null;
  extra_cost_net?: number | null;
  frozen_capital: number;
  rotation?: number | null;
  days_cover?: number | null;
  status: "loss" | "low_margin" | "healthy" | "dead_stock" | "premium" | "unknown";
  recommendations: string[];
};

export type ProductProfitabilitySummary = {
  revenue_net: number;
  profit_gross: number;
  avg_margin_percent?: number | null;
  loss_products: number;
  frozen_capital: number;
  low_margin_products: number;
};

export type ProductProfitabilityPayload = {
  rows: ProductProfitabilityRow[];
  summary: ProductProfitabilitySummary;
  pagination: { page: number; page_size: number; total: number };
  range: { since: string; until: string; days: number };
};

export type ProductProfitabilityQuery = {
  tenant_id: number;
  range_days?: number;
  page?: number;
  page_size?: number;
  warehouse_id?: number | null;
  brand_id?: number | null;
  supplier_id?: number | null;
  category_id?: number | null;
  only_loss?: boolean;
  only_low_margin?: boolean;
  only_no_sales?: boolean;
  only_top_profit?: boolean;
  only_high_stock?: boolean;
  sort?: string;
};

export async function fetchProductProfitability(query: ProductProfitabilityQuery): Promise<ProductProfitabilityPayload> {
  const params: Record<string, string | number | boolean | undefined> = {
    tenant_id: query.tenant_id,
    range_days: query.range_days ?? 30,
    page: query.page ?? 1,
    page_size: query.page_size ?? 25,
    warehouse_id: query.warehouse_id ?? undefined,
    brand_id: query.brand_id ?? undefined,
    supplier_id: query.supplier_id ?? undefined,
    category_id: query.category_id ?? undefined,
    only_loss: query.only_loss ? true : undefined,
    only_low_margin: query.only_low_margin ? true : undefined,
    only_no_sales: query.only_no_sales ? true : undefined,
    only_top_profit: query.only_top_profit ? true : undefined,
    only_high_stock: query.only_high_stock ? true : undefined,
    sort: query.sort || "lowest_profit",
  };
  const res = await api.get<ProductProfitabilityPayload>("/products/profitability", { params });
  return res.data;
}

