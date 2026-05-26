import api from "./axios";

export type OfficeDashboardKpi = {
  orders_today: number;
  orders_yesterday: number;
  revenue_today: number;
  revenue_yesterday: number;
  gross_profit_today: number;
  gross_profit_yesterday: number;
  avg_order_value_today: number;
  orders_change_pct: number | null;
  revenue_change_pct: number | null;
};

export async function getOfficeDashboardKpis(tenantId: number, warehouseId: number): Promise<OfficeDashboardKpi> {
  const res = await api.get<OfficeDashboardKpi>("/orders/office-dashboard-kpis/", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}
