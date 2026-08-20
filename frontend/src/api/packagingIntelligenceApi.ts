import api from "./axios";

export type PackagingIntelligenceDashboardApi = {
  period_days: number;
  /** Active auto-rules count (legacy key name). */
  suggestions_total: number;
  override_rate_pct?: number | null;
  top_packages: Array<Record<string, unknown>>;
  note?: string;
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
