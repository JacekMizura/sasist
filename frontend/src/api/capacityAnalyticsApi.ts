import api from "../axios";

export type CapacityReasonAgg = {
  reason_code: string;
  reason_label: string;
  count: number;
  percent?: number;
};

export type CapacityAnalyticsRun = {
  run_id: number;
  cart_id: number;
  tenant_id: number;
  warehouse_id: number;
  occurred_at: string | null;
  operator_user_id: number | null;
  source: string;
  strategy: string | null;
  cart_label: string | null;
  candidates_count: number;
  assigned_count: number;
  rejected_count: number;
  reasons: CapacityReasonAgg[];
};

export type CapacityReasonOrdersPage = {
  run_id: number;
  reason_code: string;
  reason_label: string;
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
  items: { order_id: number; order_number: string }[];
};

export type CapacityStats24h = {
  hours: number;
  since: string;
  runs_count: number;
  assigned_count: number;
  rejected_count: number;
  top_reasons: CapacityReasonAgg[];
};

export type OrderCapacityHistoryItem = {
  id: number;
  occurred_at: string | null;
  cart_id: number;
  cart_label: string | null;
  result: "assigned" | "rejected" | string;
  reason_code: string | null;
  reason_label: string | null;
  operator_user_id: number | null;
  run_id: number;
};

export async function fetchCartLatestCapacityRun(
  cartId: number,
): Promise<CapacityAnalyticsRun | null> {
  const res = await api.get<{ run: CapacityAnalyticsRun | null }>(
    `/capacity-analytics/carts/${cartId}/latest`,
  );
  return res.data?.run ?? null;
}

export async function fetchCapacityReasonOrders(params: {
  runId: number;
  reasonCode: string;
  offset?: number;
  limit?: number;
}): Promise<CapacityReasonOrdersPage> {
  const res = await api.get<CapacityReasonOrdersPage>(
    `/capacity-analytics/runs/${params.runId}/reasons/${encodeURIComponent(params.reasonCode)}/orders`,
    { params: { offset: params.offset ?? 0, limit: params.limit ?? 50 } },
  );
  return res.data;
}

export async function fetchCapacityStats24h(params: {
  tenantId: number;
  warehouseId: number;
  hours?: number;
}): Promise<CapacityStats24h> {
  const res = await api.get<CapacityStats24h>(`/capacity-analytics/stats`, {
    params: {
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId,
      hours: params.hours ?? 24,
    },
  });
  return res.data;
}

export async function fetchOrderCapacityHistory(
  orderId: number,
  limit = 50,
): Promise<OrderCapacityHistoryItem[]> {
  const res = await api.get<{ items: OrderCapacityHistoryItem[] }>(
    `/capacity-analytics/orders/${orderId}/history`,
    { params: { limit } },
  );
  return res.data?.items ?? [];
}
