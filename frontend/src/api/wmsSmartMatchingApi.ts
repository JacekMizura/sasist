import api from "./axios";

export type WmsSmartMatchingSettingsApi = {
  enabled: boolean;
  identical_orders_threshold: 2 | 3 | 5;
  proposal_init_status_id: number | null;
  auto_label_enabled: boolean;
  auto_label_status_ids: number[];
};

export type WmsSmartMatchingBreakApi = {
  id: number;
  order_id: number;
  order_number?: string | null;
  user_display?: string | null;
  quantity_units?: number | null;
  chosen_carton_id?: string | null;
  chosen_carton_name?: string | null;
  suggested_carton_id?: string | null;
  created_at?: string | null;
};

export type WmsSmartMatchingHistoryApi = {
  id: number;
  order_id: number;
  order_number?: string | null;
  composition_key: string;
  composition_label: string;
  carton_id?: string | null;
  carton_name?: string | null;
  suggested_carton_id?: string | null;
  user_display?: string | null;
  quantity_units?: number | null;
  broke_series: boolean;
  created_at?: string | null;
  latest_break?: WmsSmartMatchingBreakApi | null;
};

export type WmsSmartMatchingRuleApi = {
  id: number;
  composition_key: string;
  composition_label: string;
  carton_id: string;
  carton_name?: string | null;
  hit_count: number;
  is_auto: boolean;
  has_interrupted_series: boolean;
  last_order_id?: number | null;
  last_used_at?: string | null;
  latest_break?: WmsSmartMatchingBreakApi | null;
};

export async function getWmsSmartMatchingSettings(
  tenantId: number,
  warehouseId: number,
): Promise<WmsSmartMatchingSettingsApi> {
  const res = await api.get<WmsSmartMatchingSettingsApi>("/wms/smart-matching/settings", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function putWmsSmartMatchingSettings(
  body: WmsSmartMatchingSettingsApi & { tenant_id: number; warehouse_id: number },
): Promise<WmsSmartMatchingSettingsApi> {
  const res = await api.put<WmsSmartMatchingSettingsApi>("/wms/smart-matching/settings", body, {
    params: { warehouse_id: body.warehouse_id },
  });
  return res.data;
}

export async function getWmsSmartMatchingHistory(
  tenantId: number,
  warehouseId: number,
  limit = 100,
): Promise<WmsSmartMatchingHistoryApi[]> {
  const res = await api.get<WmsSmartMatchingHistoryApi[]>("/wms/smart-matching/history", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, limit },
  });
  return res.data;
}

export async function getWmsSmartMatchingRules(
  tenantId: number,
  warehouseId: number,
  limit = 100,
): Promise<WmsSmartMatchingRuleApi[]> {
  const res = await api.get<WmsSmartMatchingRuleApi[]>("/wms/smart-matching/rules", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, limit },
  });
  return res.data;
}

export async function postWmsSmartMatchingReset(
  tenantId: number,
  warehouseId: number,
): Promise<{ deleted_rules: number; message: string }> {
  const res = await api.post<{ deleted_rules: number; message: string }>(
    "/wms/smart-matching/reset",
    {},
    { params: { tenant_id: tenantId, warehouse_id: warehouseId } },
  );
  return res.data;
}
