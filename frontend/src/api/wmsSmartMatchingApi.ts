import api from "./axios";

export type WmsSmartMatchingSettingsApi = {
  enabled: boolean;
  identical_orders_threshold: 2 | 3 | 5;
  proposal_init_status_id: number | null;
  auto_label_enabled: boolean;
  auto_label_status_ids: number[];
};

export type WmsSmartMatchingCompositionItemApi = {
  product_id: number;
  product_name: string;
  quantity: number;
};

export type WmsSmartMatchingSeriesHitApi = {
  history_id: number;
  hit_index: number;
  order_id: number;
  order_number?: string | null;
  operator?: string | null;
  created_at?: string | null;
  carton_id?: string | null;
  carton_name?: string | null;
  suggested_carton_id?: string | null;
  suggested_carton_name?: string | null;
  broke_series: boolean;
  is_override: boolean;
  is_decisive: boolean;
};

export type WmsSmartMatchingHistorySeriesItemApi = {
  composition_key: string;
  composition_preview: string;
  composition_extra_count: number;
  composition_items: WmsSmartMatchingCompositionItemApi[];
  composition_label_fallback?: string | null;
  carton_id: string;
  carton_name?: string | null;
  hit_count: number;
  threshold: number;
  current_threshold: number;
  created_threshold?: number | null;
  has_active_rule: boolean;
  rule_id?: number | null;
  created_from_history_id?: number | null;
  last_operator?: string | null;
  last_at?: string | null;
  override_count: number;
  has_overrides: boolean;
  hits: WmsSmartMatchingSeriesHitApi[];
};

export type WmsSmartMatchingHistorySeriesPageApi = {
  page: number;
  limit: number;
  total: number;
  current_threshold: number;
  items: WmsSmartMatchingHistorySeriesItemApi[];
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

export async function getWmsSmartMatchingHistorySeries(
  tenantId: number,
  warehouseId: number,
  page = 1,
  limit = 50,
): Promise<WmsSmartMatchingHistorySeriesPageApi> {
  const res = await api.get<WmsSmartMatchingHistorySeriesPageApi>("/wms/smart-matching/history-series", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, page, limit },
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
