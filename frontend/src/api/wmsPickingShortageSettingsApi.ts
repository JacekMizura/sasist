import api from "./axios";

export type WmsShortageResolvePriorityApi = "normal" | "high" | "immediate_picking";

export type WmsPickingShortageSettingsReadApi = {
  tenant_id: number;
  warehouse_id: number;
  shortage_reported_order_ui_status_id: number | null;
  auto_enqueue_braki: boolean;
  allow_continue_other_lines_after_shortage: boolean;
  priority_after_shortage_resolved: WmsShortageResolvePriorityApi;
  auto_reopen_picking_after_shortage_resolved: boolean;
  recovery_completed_order_ui_status_id: number | null;
  wms_validation_failed_order_ui_status_id?: number | null;
};

export type WmsPickingShortageSettingsSaveApi = {
  tenant_id: number;
  warehouse_id?: number | null;
  shortage_reported_order_ui_status_id: number | null;
  auto_enqueue_braki: boolean;
  allow_continue_other_lines_after_shortage: boolean;
  priority_after_shortage_resolved: WmsShortageResolvePriorityApi;
  auto_reopen_picking_after_shortage_resolved: boolean;
  recovery_completed_order_ui_status_id: number | null;
  wms_validation_failed_order_ui_status_id?: number | null;
};

export async function getWmsPickingShortageSettings(
  tenantId: number,
  warehouseId: number,
): Promise<WmsPickingShortageSettingsReadApi> {
  const res = await api.get<WmsPickingShortageSettingsReadApi>("/wms/settings/picking-shortage", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function saveWmsPickingShortageSettings(
  body: WmsPickingShortageSettingsSaveApi,
): Promise<WmsPickingShortageSettingsReadApi> {
  const res = await api.post<WmsPickingShortageSettingsReadApi>("/wms/settings/picking-shortage", body);
  return res.data;
}
