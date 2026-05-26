import api from "./axios";

import type { WmsPackingSettingsRead, WmsPackingSettingsSave } from "../types/wmsPackingSettings";

export async function getWmsPackingSettings(tenantId: number, warehouseId: number): Promise<WmsPackingSettingsRead> {
  const res = await api.get<WmsPackingSettingsRead>("wms/settings/packing", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function saveWmsPackingSettings(body: WmsPackingSettingsSave): Promise<WmsPackingSettingsRead> {
  const res = await api.patch<WmsPackingSettingsRead>("wms/settings/packing", body);
  return res.data;
}
