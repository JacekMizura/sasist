import api from "./axios";

export type ProductionPlanningPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type CoverageColor = "red" | "orange" | "green" | "blue";

export type ProductionDemandSummary = {
  order_demand_total: number;
  order_production_needed: number;
  forecast_production_needed: number;
  combined_production_needed: number;
  on_hand_total: number;
  in_pipeline_total: number;
};

export type ProductionDemandProductRow = {
  product_id: number;
  composition_id?: number | null;
  product_name: string;
  product_sku?: string | null;
  product_image_url?: string | null;
  on_hand: number;
  avg_daily_sales: number;
  coverage_days?: number | null;
  coverage_color: CoverageColor;
  in_pipeline: number;
  order_demand: number;
  forecast_demand: number;
  forecast_production_needed: number;
  order_production_needed: number;
  combined_production_needed: number;
  priority: ProductionPlanningPriority;
};

export type ProductionDemandPlanning = {
  tenant_id: number;
  warehouse_id: number;
  coverage_days: number;
  sales_lookback_days: number;
  coverage_day_presets: number[];
  summary: ProductionDemandSummary;
  products: ProductionDemandProductRow[];
};

export type DemandBatchLineDraft = {
  product_id: number;
  composition_id: number;
  planned_quantity: number;
};

export async function fetchProductionDemandPlanning(params: {
  tenantId: number;
  warehouseId: number;
  coverageDays?: number;
  salesLookbackDays?: number;
}): Promise<ProductionDemandPlanning> {
  const res = await api.get<ProductionDemandPlanning>("/production/planning/demand", {
    params: {
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId,
      ...(params.coverageDays != null ? { coverage_days: params.coverageDays } : {}),
      ...(params.salesLookbackDays != null ? { sales_lookback_days: params.salesLookbackDays } : {}),
    },
  });
  return res.data;
}
