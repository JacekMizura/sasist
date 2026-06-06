import api from "../../../../api/axios";
import type { DirectSalesSettingsRead, DirectSalesSettingsSave } from "../schemas/directSalesSettingsSchema";

export async function getDirectSalesSettings(params: {
  tenantId: number;
  warehouseId: number;
}): Promise<DirectSalesSettingsRead> {
  const { data } = await api.get<DirectSalesSettingsRead>("wms/settings/direct-sales", {
    params: { tenant_id: params.tenantId, warehouse_id: params.warehouseId },
  });
  return data;
}

export async function saveDirectSalesSettings(body: DirectSalesSettingsSave): Promise<DirectSalesSettingsRead> {
  const { data } = await api.put<DirectSalesSettingsRead>("wms/settings/direct-sales", body);
  return data;
}
