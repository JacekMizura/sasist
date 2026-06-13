import api from "./axios";

export type WmsDashboardAlert = {
  kind: "error" | "warning" | "info";
  message: string;
};

export type WmsDashboardTopProduct = {
  product_id: number;
  name: string;
  image_url: string | null;
  pick_qty: number;
};

export type WmsOperationalHealth = "nominal" | "attention" | "critical";

export type WmsDashboardSummary = {
  orders_today: number;
  orders_to_collect: number;
  packing_spakowane: number;
  packing_do_spakowania: number;
  packing_w_trakcie: number;
  packing_braki: number;
  picking_collected: number;
  picking_to_collect: number;
  packing_packed: number;
  packing_to_pack: number;
  alerts: WmsDashboardAlert[];
  top_picked_products: WmsDashboardTopProduct[];
  orders_delayed: number;
  orders_closed_packed_today: number;
  active_picking_sessions: number;
  last_activity_at: string | null;
  operational_health: WmsOperationalHealth;
};

export async function getWmsDashboardSummary(tenantId: number, warehouseId: number): Promise<WmsDashboardSummary> {
  const res = await api.get<WmsDashboardSummary>("/wms/dashboard/summary", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export type WmsTenantPanelCounters = {
  orders_delayed: number;
  packing_braki: number;
};

export async function getTenantWmsPanelCounters(tenantId: number): Promise<WmsTenantPanelCounters> {
  const res = await api.get<WmsTenantPanelCounters>("/wms/dashboard/tenant-panel-counters", {
    params: { tenant_id: tenantId },
  });
  return res.data;
}
