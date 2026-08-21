import api from "./axios";

export type WmsThreeDMatchingHistoryItemApi = {
  id: number;
  order_id: number;
  order_number?: string | null;
  trigger: string;
  strategy: string;
  three_d_enabled_snapshot: boolean;
  filler_percent_snapshot: number;
  shipping_method_id?: string | null;
  shipping_method_name?: string | null;
  result_status: string;
  result_label: string;
  suggested_carton_id?: string | null;
  suggested_carton_name?: string | null;
  selected_carton_id?: string | null;
  selected_carton_name?: string | null;
  fill_percent?: number | null;
  candidate_count: number;
  compatible_candidate_count: number;
  error_code?: string | null;
  error_message?: string | null;
  composition_items: Array<{ product_id: number; product_name: string; quantity: number }>;
  triggered_by_user_id?: number | null;
  triggered_by_display?: string | null;
  created_at?: string | null;
  selected_at?: string | null;
};

export type WmsThreeDMatchingHistoryPageApi = {
  page: number;
  limit: number;
  total: number;
  items: WmsThreeDMatchingHistoryItemApi[];
};

export type GetThreeDMatchingHistoryParams = {
  tenantId: number;
  warehouseId: number;
  page?: number;
  limit?: number;
  orderQ?: string;
  resultStatus?: string;
  cartonId?: string;
  userId?: number;
  strategy?: string;
  trigger?: string;
  dateFrom?: string;
  dateTo?: string;
};

export async function getThreeDMatchingHistory(
  params: GetThreeDMatchingHistoryParams,
): Promise<WmsThreeDMatchingHistoryPageApi> {
  const res = await api.get<WmsThreeDMatchingHistoryPageApi>("/wms/3d-matching/history", {
    params: {
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId,
      page: params.page ?? 1,
      limit: params.limit ?? 50,
      order_q: params.orderQ || undefined,
      result_status: params.resultStatus || undefined,
      carton_id: params.cartonId || undefined,
      user_id: params.userId || undefined,
      strategy: params.strategy || undefined,
      trigger: params.trigger || undefined,
      date_from: params.dateFrom || undefined,
      date_to: params.dateTo || undefined,
    },
  });
  return res.data;
}
