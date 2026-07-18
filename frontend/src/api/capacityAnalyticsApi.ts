import api from "./axios";

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

/** Latest Capacity Engine run summary for a cart (short UX summary). */
export async function fetchCartLatestCapacityRun(
  cartId: number,
): Promise<CapacityAnalyticsRun | null> {
  const res = await api.get<{ run: CapacityAnalyticsRun | null }>(
    `/capacity-analytics/carts/${cartId}/latest`,
  );
  return res.data?.run ?? null;
}
