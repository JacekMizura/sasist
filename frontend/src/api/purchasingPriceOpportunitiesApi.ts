/**
 * Okazje cenowe (oszczędności zakupowe) — GET /purchasing/price-opportunities
 */
import api from "./axios";

export type PriceOpportunityType =
  | "cheaper_supplier"
  | "price_increase"
  | "threshold_discount"
  | "bulk_discount"
  | "low_rotation_high_cost";

export type PriceOpportunitySeverity = "low" | "medium" | "high";

export type PriceHistoryPoint = {
  date: string;
  unit_price: number | null;
  quantity: number;
  source: "purchase_order" | "delivery";
};

export type SupplierPriceOffer = {
  supplier_id: number;
  supplier_name: string;
  purchase_price: number | null;
  min_order_qty: number | null;
};

export type PriceOpportunityDrawer = {
  product_id: number;
  product_name: string;
  price_history: PriceHistoryPoint[];
  supplier_offers: SupplierPriceOffer[];
  monthly_purchase_units: number;
  monthly_sales_units: number;
};

export type PriceOpportunityRow = {
  type: PriceOpportunityType;
  severity: PriceOpportunitySeverity;
  product_id: number | null;
  product_name: string;
  supplier_id: number;
  supplier_name: string;
  current_price: number | null;
  best_price: number | null;
  previous_price: number | null;
  price_diff_value: number | null;
  price_diff_percent: number | null;
  estimated_saving: number;
  monthly_volume: number;
  recommendation: string;
  action_label: string;
};

export type PurchasingPriceOpportunitiesPayload = {
  summary: {
    total_opportunities: number;
    total_possible_savings: number;
    cheaper_supplier_cases: number;
    threshold_discount_cases: number;
    price_increase_cases: number;
    bulk_discount_cases: number;
    low_rotation_high_cost_cases: number;
  };
  rows: PriceOpportunityRow[];
  data_message: string | null;
  drawer: PriceOpportunityDrawer | null;
};

export async function fetchPurchasingPriceOpportunities(params: {
  tenantId: number;
  supplierId?: number | null;
  warehouseId?: number | null;
  type?: string | null;
  rangeDays: number;
  activeSkuOnly: boolean;
  productId?: number | null;
}): Promise<PurchasingPriceOpportunitiesPayload> {
  const res = await api.get<PurchasingPriceOpportunitiesPayload>("/purchasing/price-opportunities", {
    params: {
      tenant_id: params.tenantId,
      supplier_id: params.supplierId ?? undefined,
      warehouse_id: params.warehouseId ?? undefined,
      type: params.type ?? undefined,
      range_days: params.rangeDays,
      active_sku_only: params.activeSkuOnly,
      product_id: params.productId ?? undefined,
    },
  });
  return res.data;
}
