import api from "./axios";

export type PurchasingSegmentsSummary = {
  total_products: number;
  products_a_count: number;
  ax_count: number;
  high_risk_count: number;
  dead_stock_count: number;
  segment_counts: Record<string, number>;
};

export type PurchasingSegmentRow = {
  product_id: number;
  name: string;
  sku: string | null;
  ean: string | null;
  supplier_name: string;
  stock: number;
  stock_value: number;
  sales_qty: number;
  sales_value: number;
  avg_daily_sales: number;
  demand_stddev: number | null;
  coefficient_variation: number | null;
  abc_class: string;
  xyz_class: string;
  segment: string;
  suggested_strategy: string;
  reorder_priority: number;
};

export type PurchasingSegmentsPayload = {
  range_days: number;
  summary: PurchasingSegmentsSummary;
  rows: PurchasingSegmentRow[];
};

export async function fetchPurchasingSegments(params: {
  tenantId: number;
  warehouseId: number | null;
  rangeDays: 30 | 90 | 365;
  segmentFilter?: string | null;
  supplierId?: number | null;
  deadStockOnly?: boolean;
  highPriorityOnly?: boolean;
}): Promise<PurchasingSegmentsPayload> {
  const res = await api.get<PurchasingSegmentsPayload>("/purchasing/segments", {
    params: {
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId ?? undefined,
      range_days: params.rangeDays,
      segment_filter: params.segmentFilter || undefined,
      supplier_id: params.supplierId ?? undefined,
      dead_stock_only: params.deadStockOnly || undefined,
      high_priority_only: params.highPriorityOnly || undefined,
    },
  });
  return res.data;
}
