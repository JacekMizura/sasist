import api from "./axios";

export type ProductionPlanningPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type CoverageColor = "red" | "orange" | "green" | "blue";
export type ForecastStrategyKey =
  | "PERIOD_AVERAGE"
  | "WEIGHTED_AVERAGE"
  | "WEEKDAY_AVERAGE"
  | "MEDIAN"
  | "MAX_DAILY"
  | "AI_SMART";

export type ProductionPlanningDashboard = {
  critical_products: number;
  production_needed_today: number;
  material_shortage_products: number;
  total_recommended_quantity: number;
  average_coverage_days?: number | null;
  order_demand_total: number;
};

export type TimelinePoint = {
  offset_days: number;
  quantity: number;
  phase: string;
  completion_date?: string;
};

export type MaterialProductionStatus = "OK" | "PARTIAL" | "BLOCKED";

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
  min_stock?: number | null;
  max_stock?: number | null;
  production_moq?: number | null;
  production_batch_multiple?: number | null;
  production_lead_time_days: number;
  max_producible: number;
  material_status: MaterialProductionStatus;
  material_status_description?: string;
  producible_now_qty: number;
  waiting_qty: number;
  limiting_component_name?: string | null;
  recommended_quantity: number;
  combined_production_needed: number;
  priority: ProductionPlanningPriority;
  recommendation_reasons: string[];
  timeline: TimelinePoint[];
};

export type ProductionDemandPlanning = {
  tenant_id: number;
  warehouse_id: number;
  coverage_days: number;
  sales_lookback_days: number;
  forecast_strategy: ForecastStrategyKey;
  forecast_strategy_label: string;
  coverage_day_presets: number[];
  forecast_strategies: { key: string; label: string }[];
  dashboard: ProductionPlanningDashboard;
  products: ProductionDemandProductRow[];
};

export type ProductionPlanSimulation = {
  tenant_id: number;
  warehouse_id: number;
  coverage_days: number;
  forecast_strategy: string;
  lines: Array<{
    product_id: number;
    product_name: string;
    composition_id: number;
    requested_quantity: number;
    simulated_quantity: number;
    material_shortages: Array<Record<string, unknown>>;
    projected_on_hand: number;
    projected_coverage_days?: number | null;
    estimated_completion_date?: string | null;
    remains_critical: boolean;
  }>;
  materials: Array<{
    component_product_id: number;
    component_name: string;
    required_total: number;
    available: number;
    shortage: number;
  }>;
  products_still_critical: number;
  estimated_completion_date?: string | null;
  total_simulated_quantity: number;
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
}): Promise<ProductionDemandPlanning> {
  const res = await api.get<ProductionDemandPlanning>("/production/planning/demand", {
    params: {
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId,
      ...(params.coverageDays != null ? { coverage_days: params.coverageDays } : {}),
    },
  });
  return res.data;
}

export async function simulateProductionPlan(body: {
  tenant_id: number;
  warehouse_id: number;
  coverage_days: number;
}): Promise<ProductionPlanSimulation> {
  const res = await api.post<ProductionPlanSimulation>("/production/planning/simulate", body);
  return res.data;
}

export async function createBatchesFromSimulation(body: {
  tenant_id: number;
  warehouse_id: number;
  coverage_days: number;
}): Promise<{ batch_ids: number[] }> {
  const res = await api.post<{ batch_ids: number[] }>("/production/planning/simulate/create-batches", body);
  return res.data;
}
