/**
 * Warehouse picking terminal scan policy (SSOT: GET/POST /wms/settings/picking-terminal).
 */
import api from "./axios";

export type WmsPickingTerminalSettingsApi = {
  tenant_id: number;
  warehouse_id: number;
  require_product_scan_at_least_once: boolean;
  require_location_scan: boolean;
  disable_force_location_scan_when_many_locations: boolean;
  allow_reserve_location_picking: boolean;
};

export type WmsPickingTerminalSettingsSaveApi = {
  tenant_id: number;
  warehouse_id?: number | null;
  require_product_scan_at_least_once: boolean;
  require_location_scan: boolean;
  disable_force_location_scan_when_many_locations: boolean;
  allow_reserve_location_picking: boolean;
};

export async function getWmsPickingTerminalSettings(
  tenantId: number,
  warehouseId: number,
): Promise<WmsPickingTerminalSettingsApi> {
  const res = await api.get<WmsPickingTerminalSettingsApi>("/wms/settings/picking-terminal", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function saveWmsPickingTerminalSettings(
  body: WmsPickingTerminalSettingsSaveApi,
): Promise<WmsPickingTerminalSettingsApi> {
  const res = await api.post<WmsPickingTerminalSettingsApi>("/wms/settings/picking-terminal", body);
  return res.data;
}
