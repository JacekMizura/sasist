import api from "./axios";

export type PackagingIntelligenceDashboardApi = {
  period_days: number;
  suggestions_total: number;
  override_rate_pct?: number | null;
  avg_confidence?: number | null;
  avg_fill_pct?: number | null;
  products_missing_dimensions: number;
  top_packages: Array<Record<string, unknown>>;
  failed_suggestions: number;
  note: string;
};

export async function getPackagingIntelligenceDashboard(
  tenantId: number,
  warehouseId: number,
  periodDays = 7,
): Promise<PackagingIntelligenceDashboardApi> {
  const res = await api.get<PackagingIntelligenceDashboardApi>("/wms/packaging-intelligence/dashboard", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, period_days: periodDays },
  });
  return res.data;
}
