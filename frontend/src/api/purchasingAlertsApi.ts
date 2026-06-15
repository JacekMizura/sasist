import api from "./axios";

export const PURCHASING_ALERT_RULE_TYPES = [
  "low_cover_days",
  "dead_stock",
  "delayed_supplier_delivery",
  "rising_demand",
  "high_capital_locked",
] as const;

export type PurchasingAlertRuleType = (typeof PURCHASING_ALERT_RULE_TYPES)[number];

export type PurchasingAlertSummary = {
  open_alerts: number;
  critical_open: number;
  resolved_today: number;
  draft_orders_waiting: number;
};

export type PurchasingAlertRule = {
  id: number;
  tenant_id: number;
  name: string;
  type: string;
  is_enabled: boolean;
  severity: string;
  config_json: string;
  created_at: string;
};

export type PurchasingAlertEvent = {
  id: number;
  tenant_id: number;
  rule_id: number;
  rule_type: string;
  rule_name: string;
  product_id: number | null;
  supplier_id: number | null;
  status: string;
  severity: string;
  title: string;
  message: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type PurchasingAutoDraftRow = {
  id: number;
  generated_at: string;
  purchase_order_ids: number[];
  summary: Record<string, unknown> | null;
};

export async function fetchPurchasingAlertsSummary(tenantId: number): Promise<PurchasingAlertSummary> {
  const res = await api.get<PurchasingAlertSummary>("/purchasing/alerts/summary", { params: { tenant_id: tenantId } });
  return res.data;
}

export async function fetchPurchasingAlerts(params: {
  tenantId: number;
  status?: string;
  severity?: string;
  ruleType?: string;
  limit?: number;
}): Promise<PurchasingAlertEvent[]> {
  const res = await api.get<{ rows: PurchasingAlertEvent[] }>("/purchasing/alerts", {
    params: {
      tenant_id: params.tenantId,
      status: params.status || undefined,
      severity: params.severity || undefined,
      rule_type: params.ruleType || undefined,
      limit: params.limit ?? 200,
    },
  });
  return res.data.rows ?? [];
}

export async function fetchPurchasingAlertRules(tenantId: number): Promise<PurchasingAlertRule[]> {
  const res = await api.get<PurchasingAlertRule[]>("/purchasing/alerts/rules", { params: { tenant_id: tenantId } });
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchPurchasingAutoDrafts(tenantId: number, limit = 10): Promise<PurchasingAutoDraftRow[]> {
  const res = await api.get<{ rows: PurchasingAutoDraftRow[] }>("/purchasing/alerts/auto-drafts", {
    params: { tenant_id: tenantId, limit },
  });
  return res.data.rows ?? [];
}

export async function postPurchasingAlertRule(body: {
  tenant_id: number;
  name: string;
  type: string;
  severity: string;
  config_json?: string;
  is_enabled?: boolean;
}): Promise<PurchasingAlertRule> {
  const res = await api.post<PurchasingAlertRule>("/purchasing/alerts/rules", body);
  return res.data;
}

export async function patchPurchasingAlertRule(
  ruleId: number,
  tenantId: number,
  body: { name?: string; is_enabled?: boolean; severity?: string; config_json?: string },
): Promise<PurchasingAlertRule> {
  const res = await api.patch<PurchasingAlertRule>(`/purchasing/alerts/rules/${ruleId}`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function postPurchasingAlertsRunScan(tenantId: number, warehouseId: number | null): Promise<{
  rules_evaluated: number;
  events_touched: number;
  message: string;
}> {
  const res = await api.post("/purchasing/alerts/run-scan", {
    tenant_id: tenantId,
    warehouse_id: warehouseId ?? undefined,
  });
  return res.data;
}

export async function postPurchasingAlertsCreateDraftOrders(
  tenantId: number,
  warehouseId: number,
): Promise<{
  purchase_order_ids: number[];
  summary: Record<string, unknown>;
  created_orders: unknown[];
  skipped_product_ids: number[];
  auto_draft_id: number | null;
}> {
  const res = await api.post("/purchasing/alerts/create-draft-orders", {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
  });
  return res.data;
}

export async function postPurchasingAlertsBulkResolve(
  tenantId: number,
  eventIds: number[],
): Promise<{ resolved_ids: number[]; skipped_ids: number[] }> {
  const res = await api.post("/purchasing/alerts/bulk-resolve", { tenant_id: tenantId, event_ids: eventIds });
  return res.data;
}

export async function patchPurchasingAlertAcknowledge(
  eventId: number,
  tenantId: number,
): Promise<PurchasingAlertEvent> {
  const res = await api.patch<PurchasingAlertEvent>(`/purchasing/alerts/${eventId}/acknowledge`, {}, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function patchPurchasingAlertResolve(eventId: number, tenantId: number): Promise<PurchasingAlertEvent> {
  const res = await api.patch<PurchasingAlertEvent>(`/purchasing/alerts/${eventId}/resolve`, {}, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}
