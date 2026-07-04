import api from "./axios";
import { DAMAGE_TENANT_ID } from "../pages/damage/damageShared";

export type WmsProductValidationSettings = {
  tenant_id: number;
  warehouse_id: number;
  validation_policy_migrated: boolean;
  require_dimensions: boolean;
  require_weight: boolean;
  require_batch: boolean;
  require_expiry: boolean;
  require_serial: boolean;
  require_master_carton: boolean;
  require_master_carton_ean: boolean;
  require_master_carton_qty: boolean;
  require_master_carton_dims: boolean;
  require_master_carton_weight: boolean;
};

export type WmsProductValidationSettingsSave = Omit<
  WmsProductValidationSettings,
  "tenant_id" | "warehouse_id" | "validation_policy_migrated"
> & {
  tenant_id: number;
  warehouse_id?: number | null;
};

export async function getWmsProductValidationSettings(params?: {
  tenantId?: number;
  warehouseId?: number;
}): Promise<WmsProductValidationSettings> {
  const res = await api.get<WmsProductValidationSettings>("/wms/settings/product-validation", {
    params: {
      tenant_id: params?.tenantId ?? DAMAGE_TENANT_ID,
      ...(params?.warehouseId != null && params.warehouseId > 0 ? { warehouse_id: params.warehouseId } : {}),
    },
  });
  return res.data;
}

export async function saveWmsProductValidationSettings(
  body: WmsProductValidationSettingsSave,
): Promise<WmsProductValidationSettings> {
  const res = await api.put<WmsProductValidationSettings>("/wms/settings/product-validation", body);
  return res.data;
}
