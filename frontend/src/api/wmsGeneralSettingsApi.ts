/**
 * Warehouse general WMS settings (SSOT: GET/POST /wms/settings/general).
 */
import api from "./axios";

export type WmsFontSizePx = 12 | 14 | 16 | 18 | 20;

export type WmsGeneralSettingsApi = {
  tenant_id: number;
  warehouse_id: number;
  font_size_base_px: number;
  font_size_location_px: number;
  font_size_quantity_px: number;
};

export type WmsGeneralSettingsSaveApi = {
  tenant_id: number;
  warehouse_id?: number | null;
  font_size_base_px: WmsFontSizePx;
  font_size_location_px: WmsFontSizePx;
  font_size_quantity_px: WmsFontSizePx;
};

export async function getWmsGeneralSettings(
  tenantId: number,
  warehouseId: number,
): Promise<WmsGeneralSettingsApi> {
  const res = await api.get<WmsGeneralSettingsApi>("/wms/settings/general", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function saveWmsGeneralSettings(
  body: WmsGeneralSettingsSaveApi,
): Promise<WmsGeneralSettingsApi> {
  const res = await api.post<WmsGeneralSettingsApi>("/wms/settings/general", body);
  return res.data;
}
