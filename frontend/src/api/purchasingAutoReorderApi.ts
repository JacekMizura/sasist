import api from "./axios";

export type PurchaseAutoReorderKpis = {
  active_rules: number;
  last_run_finished_at: string | null;
  drafts_created_today: number;
  time_saved_minutes_heuristic: number;
};

export type PurchaseAutoRule = {
  id: number;
  tenant_id: number;
  name: string;
  is_enabled: boolean;
  run_time: string;
  weekdays_json: string;
  config_json: string;
  created_at: string;
};

export type PurchaseAutoRun = {
  id: number;
  tenant_id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  created_orders_count: number;
  skipped_products_count: number;
  log_json: string | null;
};

export type PurchaseAutoReorderHistoryPayload = {
  kpis: PurchaseAutoReorderKpis;
  runs: PurchaseAutoRun[];
};

export type PurchaseAutoReorderPreviewPayload = {
  rule_id: number;
  rule_name: string;
  count: number;
  rows: {
    product_id: number;
    name?: string | null;
    sku?: string | null;
    segment?: string | null;
    supplier_name?: string | null;
    suggested_qty: number;
    estimated_order_value?: number | null;
  }[];
  meta: Record<string, unknown>;
};

export type PurchaseAutoReorderRunResult = {
  run_id: number;
  status: string;
  created_orders_count: number;
  skipped_products_count: number;
  purchase_order_ids: number[];
  dry_run: boolean;
  preview_rows: unknown[];
};

export async function fetchAutoReorderRules(tenantId: number): Promise<PurchaseAutoRule[]> {
  const res = await api.get<PurchaseAutoRule[]>("/purchasing/auto-reorder/rules", { params: { tenant_id: tenantId } });
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchAutoReorderHistory(
  tenantId: number,
  limit = 50,
): Promise<PurchaseAutoReorderHistoryPayload> {
  const res = await api.get<PurchaseAutoReorderHistoryPayload>("/purchasing/auto-reorder/history", {
    params: { tenant_id: tenantId, limit },
  });
  return res.data;
}

export async function fetchAutoReorderPreview(tenantId: number, ruleId: number): Promise<PurchaseAutoReorderPreviewPayload> {
  const res = await api.get<PurchaseAutoReorderPreviewPayload>("/purchasing/auto-reorder/preview", {
    params: { tenant_id: tenantId, rule_id: ruleId },
  });
  return res.data;
}

export async function postAutoReorderRule(body: {
  tenant_id: number;
  name: string;
  is_enabled?: boolean;
  run_time?: string;
  weekdays_json?: string;
  config_json?: string;
}): Promise<PurchaseAutoRule> {
  const res = await api.post<PurchaseAutoRule>("/purchasing/auto-reorder/rules", body);
  return res.data;
}

export async function patchAutoReorderRule(
  ruleId: number,
  tenantId: number,
  body: Partial<{ name: string; is_enabled: boolean; run_time: string; weekdays_json: string; config_json: string }>,
): Promise<PurchaseAutoRule> {
  const res = await api.patch<PurchaseAutoRule>(`/purchasing/auto-reorder/rules/${ruleId}`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function deleteAutoReorderRule(ruleId: number, tenantId: number): Promise<void> {
  await api.delete(`/purchasing/auto-reorder/rules/${ruleId}`, { params: { tenant_id: tenantId } });
}

export async function postAutoReorderRunNow(body: {
  tenant_id: number;
  rule_id?: number | null;
  dry_run?: boolean;
}): Promise<{ batch: boolean; results: PurchaseAutoReorderRunResult[] }> {
  const res = await api.post<{ batch: boolean; results: PurchaseAutoReorderRunResult[] }>(
    "/purchasing/auto-reorder/run-now",
    body,
  );
  return res.data;
}
