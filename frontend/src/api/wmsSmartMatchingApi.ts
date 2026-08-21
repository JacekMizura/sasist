import api from "./axios";

export type WmsSmartMatchingSettingsApi = {
  enabled: boolean;
  smart_enabled: boolean;
  three_d_enabled: boolean;
  three_d_filler_percent: number;
  identical_orders_threshold: 2 | 3 | 5;
  proposal_init_status_id: number | null;
  auto_label_enabled: boolean;
  auto_label_status_ids: number[];
  packaging_strategy: string;
  legacy_v1_fallback_enabled?: boolean;
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

export type WmsSmartMatchingRuleV2Api = {
  id: number;
  product_id: number;
  min_qty: number;
  carton_id: string;
  carton_name?: string | null;
  source: string;
  status: string;
  is_locked: boolean;
  hit_count: number;
  override_streak: number;
  created_threshold?: number | null;
};

export type WmsSmartMatchingObservationV2Api = {
  id: number;
  order_id: number;
  quantity: number;
  carton_id?: string | null;
  carton_name?: string | null;
  suggested_carton_id?: string | null;
  created_at?: string | null;
};

export type WmsSmartMatchingProductPanelApi = {
  product_id: number;
  smart_matching_enabled: boolean;
  rules: WmsSmartMatchingRuleV2Api[];
  conflicts: WmsSmartMatchingRuleV2Api[];
  recent_observations: WmsSmartMatchingObservationV2Api[];
};

export async function getProductSmartMatchingPanel(
  tenantId: number,
  warehouseId: number,
  productId: number,
): Promise<WmsSmartMatchingProductPanelApi> {
  const res = await api.get<WmsSmartMatchingProductPanelApi>(
    `/wms/smart-matching/products/${productId}`,
    { params: { tenant_id: tenantId, warehouse_id: warehouseId } },
  );
  return res.data;
}

export async function putProductSmartMatchingEnabled(
  tenantId: number,
  warehouseId: number,
  productId: number,
  enabled: boolean,
): Promise<WmsSmartMatchingProductPanelApi> {
  const res = await api.put<WmsSmartMatchingProductPanelApi>(
    `/wms/smart-matching/products/${productId}/settings`,
    {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      smart_matching_enabled: enabled,
    },
    { params: { warehouse_id: warehouseId } },
  );
  return res.data;
}

export async function postProductManualRule(
  tenantId: number,
  warehouseId: number,
  productId: number,
  body: { min_qty: number; carton_id: string; is_locked?: boolean },
): Promise<WmsSmartMatchingRuleV2Api> {
  const res = await api.post<WmsSmartMatchingRuleV2Api>(
    `/wms/smart-matching/products/${productId}/rules`,
    {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      min_qty: body.min_qty,
      carton_id: body.carton_id,
      is_locked: Boolean(body.is_locked),
    },
    { params: { warehouse_id: warehouseId } },
  );
  return res.data;
}

export async function putProductManualRule(
  tenantId: number,
  warehouseId: number,
  productId: number,
  ruleId: number,
  body: { min_qty: number; carton_id: string; is_locked?: boolean },
): Promise<WmsSmartMatchingRuleV2Api> {
  const res = await api.put<WmsSmartMatchingRuleV2Api>(
    `/wms/smart-matching/products/${productId}/rules/${ruleId}`,
    {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      min_qty: body.min_qty,
      carton_id: body.carton_id,
      is_locked: Boolean(body.is_locked),
    },
    { params: { warehouse_id: warehouseId } },
  );
  return res.data;
}

export async function putRuleV2Lock(
  tenantId: number,
  warehouseId: number,
  ruleId: number,
  isLocked: boolean,
): Promise<WmsSmartMatchingRuleV2Api> {
  const res = await api.put<WmsSmartMatchingRuleV2Api>(
    `/wms/smart-matching/rules-v2/${ruleId}/lock`,
    { tenant_id: tenantId, warehouse_id: warehouseId, is_locked: isLocked },
    { params: { warehouse_id: warehouseId } },
  );
  return res.data;
}

export async function deleteProductManualRule(
  tenantId: number,
  warehouseId: number,
  productId: number,
  ruleId: number,
): Promise<void> {
  await api.delete(`/wms/smart-matching/products/${productId}/rules/${ruleId}`, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
}

export type WmsSmartMatchingHistoryEventApi = {
  observation_id: number;
  order_id: number;
  order_number?: string | null;
  pattern_type?: string;
  product: { id: number; name: string };
  quantity: number;
  composition_items?: { product_id: number; name: string; quantity: number }[];
  composition_identity_hash?: string | null;
  carton?: { id?: string | null; name?: string | null } | null;
  suggested_carton?: { id?: string | null; name?: string | null } | null;
  operator: { id?: number | null; display_name?: string | null };
  created_at?: string | null;
  is_override: boolean;
  is_decisive: boolean;
  is_rule_created: boolean;
  is_rule_broken: boolean;
  linked_rule?: {
    id: number;
    min_qty: number;
    carton_id: string;
    carton_name?: string | null;
    source: string;
    status: string;
    is_locked: boolean;
    created_threshold?: number | null;
    hit_count: number;
  } | null;
  engine_version: number;
};

export type WmsSmartMatchingHistoryEventsPageApi = {
  page: number;
  limit: number;
  total: number;
  items: WmsSmartMatchingHistoryEventApi[];
};

export type WmsSmartMatchingLearningSeriesHitApi = {
  observation_id: number;
  hit_index: number;
  order_id: number;
  order_number?: string | null;
  quantity: number;
  operator?: string | null;
  created_at?: string | null;
  carton_id?: string | null;
  carton_name?: string | null;
  is_decisive: boolean;
  is_rule_broken: boolean;
  is_override: boolean;
};

export type WmsSmartMatchingLearningSeriesApi = {
  product_id: number;
  product_name: string;
  carton_id: string;
  carton_name?: string | null;
  pattern_type?: string;
  composition_identity_hash?: string | null;
  composition_items?: { product_id: number; name: string; quantity: number }[];
  created_threshold?: number | null;
  hits: WmsSmartMatchingLearningSeriesHitApi[];
  rule?: {
    id: number;
    product_id: number;
    product_name: string;
    min_qty: number;
    carton_id: string;
    carton_name?: string | null;
    source: string;
    status: string;
    is_locked: boolean;
    created_threshold?: number | null;
    label: string;
    pattern_type?: string;
  } | null;
};

export async function getSmartMatchingHistoryEvents(
  tenantId: number,
  warehouseId: number,
  opts?: {
    page?: number;
    limit?: number;
    product_id?: number;
    carton_id?: string;
    user_id?: number;
    event_type?: string;
    from?: string;
    to?: string;
  },
): Promise<WmsSmartMatchingHistoryEventsPageApi> {
  const res = await api.get<WmsSmartMatchingHistoryEventsPageApi>("/wms/smart-matching/history-events", {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      page: opts?.page ?? 1,
      limit: opts?.limit ?? 50,
      product_id: opts?.product_id,
      carton_id: opts?.carton_id,
      user_id: opts?.user_id,
      event_type: opts?.event_type ?? "all",
      from: opts?.from,
      to: opts?.to,
    },
  });
  return res.data;
}

export async function getSmartMatchingLearningSeries(
  tenantId: number,
  warehouseId: number,
  opts: {
    cartonId: string;
    productId?: number;
    compositionIdentityHash?: string | null;
  },
): Promise<WmsSmartMatchingLearningSeriesApi> {
  const res = await api.get<WmsSmartMatchingLearningSeriesApi>("/wms/smart-matching/learning-series", {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      carton_id: opts.cartonId,
      product_id: opts.productId,
      composition_identity_hash: opts.compositionIdentityHash || undefined,
    },
  });
  return res.data;
}
