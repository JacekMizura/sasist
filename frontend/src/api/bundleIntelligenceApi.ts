import api from "./axios";

export type BundleKpiRow = {
  bundle_id: number;
  bundle_name: string;
  units_sold: number;
  revenue_net: number;
  margin_net?: number | null;
  margin_percent?: number | null;
  returns_count: number;
  complaints_count: number;
  avg_pick_seconds?: number | null;
  avg_pack_seconds?: number | null;
  avg_consolidation_seconds?: number | null;
  growth_percent?: number | null;
};

export type BundleDashboard = {
  period_days: number;
  top_bundles: BundleKpiRow[];
  fastest_growing: BundleKpiRow[];
  highest_margin: BundleKpiRow[];
  most_returns: BundleKpiRow[];
};

export type BundleSlottingPair = {
  product_a_id: number;
  product_a_name: string;
  product_a_sku?: string | null;
  product_b_id: number;
  product_b_name: string;
  product_b_sku?: string | null;
  co_occurrence_rate: number;
  bundles_together_count: number;
  bundles_with_a_count: number;
  location_a?: string | null;
  location_b?: string | null;
  recommendation: string;
  priority: string;
};

export type BundleReplenishmentRow = {
  bundle_id: number;
  bundle_name: string;
  bundle_qty_forecast: number;
  product_id: number;
  product_name: string;
  sku?: string | null;
  qty_per_bundle: number;
  total_component_qty: number;
  recommendation: string;
};

export type BundleCapacityCartRow = {
  cart_id: number;
  cart_code?: string | null;
  total_volume_dm3: number;
  used_volume_dm3: number;
  utilization_percent: number;
  bundle_orders_count: number;
  recommendation: string;
};

export type BundleCapacityRackRow = {
  rack_id: number;
  rack_name: string;
  segment_label?: string | null;
  fill_percent: number;
  order_id?: number | null;
  has_bundle: boolean;
  recommendation: string;
};

export type BundleCapacityReport = {
  cart_rows: BundleCapacityCartRow[];
  rack_rows: BundleCapacityRackRow[];
  overloaded_carts: number;
  overloaded_rack_segments: number;
};

export async function getBundleIntelligenceDashboard(
  tenantId: number,
  opts?: { periodDays?: number; listLimit?: number },
): Promise<BundleDashboard> {
  const res = await api.get<BundleDashboard>("/bundles/intelligence/dashboard", {
    params: {
      tenant_id: tenantId,
      period_days: opts?.periodDays ?? 30,
      list_limit: opts?.listLimit ?? 10,
    },
  });
  return res.data;
}

export async function getBundleSlottingRecommendations(
  tenantId: number,
  opts?: { minCoOccurrenceRate?: number; limit?: number },
): Promise<BundleSlottingPair[]> {
  const res = await api.get<BundleSlottingPair[]>("/bundles/intelligence/slotting", {
    params: {
      tenant_id: tenantId,
      min_co_occurrence_rate: opts?.minCoOccurrenceRate ?? 0.8,
      limit: opts?.limit ?? 50,
    },
  });
  return res.data;
}

export async function getBundleReplenishmentForecast(
  tenantId: number,
  opts?: { horizonWeeks?: number; velocityPeriodDays?: number },
): Promise<BundleReplenishmentRow[]> {
  const res = await api.get<BundleReplenishmentRow[]>("/bundles/intelligence/replenishment", {
    params: {
      tenant_id: tenantId,
      horizon_weeks: opts?.horizonWeeks ?? 1,
      velocity_period_days: opts?.velocityPeriodDays ?? 30,
    },
  });
  return res.data;
}

export async function postBundleReplenishmentForecast(
  tenantId: number,
  body: {
    bundle_qty_forecast?: Record<number, number>;
    horizon_weeks?: number;
    velocity_period_days?: number;
  },
): Promise<BundleReplenishmentRow[]> {
  const res = await api.post<BundleReplenishmentRow[]>("/bundles/intelligence/replenishment", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function getBundleCapacityReport(tenantId: number): Promise<BundleCapacityReport> {
  const res = await api.get<BundleCapacityReport>("/bundles/intelligence/capacity", {
    params: { tenant_id: tenantId },
  });
  return res.data;
}
