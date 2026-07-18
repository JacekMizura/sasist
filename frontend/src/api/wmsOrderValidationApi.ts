import api from "./axios";

export type WmsOrderValidationIssueApi = {
  reason_code: string;
  reason_label: string;
  product_id?: number | null;
  order_item_id?: number | null;
  ean?: string | null;
  sku?: string | null;
  product_name?: string | null;
  required_qty?: number | null;
  available_qty?: number | null;
  allocatable_qty?: number | null;
  location_id?: number | null;
};

export type WmsOrderValidationStateApi = {
  order_id: number;
  validation_status: string;
  has_stored_failure: boolean;
  failed_at?: string | null;
  previous_ui_status_id?: number | null;
  issues: WmsOrderValidationIssueApi[];
  live: Record<string, unknown>;
};

export type WmsOrderRevalidateApi = {
  order_id: number;
  validation_status: string;
  issues: WmsOrderValidationIssueApi[];
  status_changed: boolean;
  restored_status_id?: number | null;
  needs_manual_status: boolean;
  config_missing: boolean;
};

export async function getOrderWmsValidation(
  tenantId: number,
  warehouseId: number,
  orderId: number,
): Promise<WmsOrderValidationStateApi> {
  const res = await api.get<WmsOrderValidationStateApi>(`/wms/orders/${orderId}/wms-validation`, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function postOrderWmsRevalidate(
  tenantId: number,
  warehouseId: number,
  orderId: number,
): Promise<WmsOrderRevalidateApi> {
  const res = await api.post<WmsOrderRevalidateApi>(`/wms/orders/${orderId}/wms-validation/revalidate`, null, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}
