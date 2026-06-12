import api from "./axios";

export type InventoryManagementModeUi = "DOCUMENTS_ONLY" | "HYBRID";

export type InventoryManagementSettingsRead = {
  tenant_id: number;
  warehouse_id: number;
  inventory_management_mode: InventoryManagementModeUi;
  can_manual_adjust_stock: boolean;
};

export type InventoryManagementSettingsSave = {
  tenant_id: number;
  warehouse_id?: number | null;
  inventory_management_mode: InventoryManagementModeUi;
};

export type ManualStockCorrectionRequest = {
  tenant_id: number;
  warehouse_id: number;
  product_id: number;
  location_id: number;
  quantity_delta: number;
  reason: string;
  stock_disposition?: string | null;
  batch_number?: string | null;
};

export type ManualStockCorrectionResponse = {
  stock_document_id: number;
  document_type: string;
  document_number?: string | null;
  quantity_delta: number;
  product_id: number;
  location_id: number;
  stock_disposition: string;
  reason: string;
};

export async function getInventoryManagementSettings(params: {
  tenantId: number;
  warehouseId?: number | null;
}): Promise<InventoryManagementSettingsRead> {
  const q: Record<string, number> = { tenant_id: params.tenantId };
  if (params.warehouseId != null && params.warehouseId > 0) {
    q.warehouse_id = params.warehouseId;
  }
  const res = await api.get<InventoryManagementSettingsRead>("wms/settings/inventory-management", { params: q });
  return res.data;
}

export async function saveInventoryManagementSettings(
  body: InventoryManagementSettingsSave,
): Promise<InventoryManagementSettingsRead> {
  const res = await api.put<InventoryManagementSettingsRead>("wms/settings/inventory-management", body);
  return res.data;
}

export async function postManualStockCorrection(
  body: ManualStockCorrectionRequest,
): Promise<ManualStockCorrectionResponse> {
  const res = await api.post<ManualStockCorrectionResponse>("wms/inventory/manual-adjustment", body);
  return res.data;
}
