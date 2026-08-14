/**
 * CRUD konfiguracji produkcji WMS (`/wms/settings/production-configs`).
 */
import api from "./axios";

export type ProductionOrderTriggerScope = "SINGLE_ELEMENT";
export type ProductionExecutionMethod = "WMS" | "PRINT";
export type AfterProductionAction = "STATUS_ONLY" | "OPEN_PACKING";

export type ProductionConfigRead = {
  id: number;
  tenant_id: number;
  warehouse_id: number;
  name: string;
  is_active: boolean;
  source_status_id: number;
  status_after_production_id: number;
  status_on_component_shortage_id: number;
  finished_goods_buffer_location_id: number;
  production_order_trigger_scope: ProductionOrderTriggerScope;
  production_execution_method: ProductionExecutionMethod;
  after_production_action: AfterProductionAction;
  created_at: string;
  source_status_name?: string | null;
  status_after_production_name?: string | null;
  status_on_component_shortage_name?: string | null;
  finished_goods_buffer_location_name?: string | null;
};

export type ProductionConfigCreate = {
  tenant_id: number;
  warehouse_id: number;
  name: string;
  is_active: boolean;
  source_status_id: number;
  status_after_production_id: number;
  status_on_component_shortage_id: number;
  finished_goods_buffer_location_id: number;
  production_order_trigger_scope?: ProductionOrderTriggerScope;
  production_execution_method?: ProductionExecutionMethod;
  after_production_action?: AfterProductionAction;
};

export type ProductionConfigUpdate = {
  name: string;
  is_active: boolean;
  status_after_production_id: number;
  status_on_component_shortage_id: number;
  finished_goods_buffer_location_id: number;
  production_order_trigger_scope?: ProductionOrderTriggerScope;
  production_execution_method?: ProductionExecutionMethod;
  after_production_action?: AfterProductionAction;
};

export async function listProductionConfigs(
  tenantId: number,
  warehouseId: number,
  includeInactive = true,
): Promise<ProductionConfigRead[]> {
  const res = await api.get<{ items: ProductionConfigRead[] }>("/wms/settings/production-configs", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, include_inactive: includeInactive },
  });
  return res.data.items;
}

export async function getProductionConfig(
  tenantId: number,
  warehouseId: number,
  configId: number,
): Promise<ProductionConfigRead> {
  const res = await api.get<ProductionConfigRead>(`/wms/settings/production-configs/${configId}`, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function createProductionConfig(body: ProductionConfigCreate): Promise<ProductionConfigRead> {
  const res = await api.post<ProductionConfigRead>("/wms/settings/production-configs", body);
  return res.data;
}

export async function updateProductionConfig(
  tenantId: number,
  warehouseId: number,
  configId: number,
  body: ProductionConfigUpdate,
): Promise<ProductionConfigRead> {
  const res = await api.put<ProductionConfigRead>(`/wms/settings/production-configs/${configId}`, body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function disableProductionConfig(
  tenantId: number,
  warehouseId: number,
  configId: number,
): Promise<ProductionConfigRead> {
  const res = await api.post<ProductionConfigRead>(
    `/wms/settings/production-configs/${configId}/disable`,
    {},
    { params: { tenant_id: tenantId, warehouse_id: warehouseId } },
  );
  return res.data;
}

export async function deleteProductionConfig(
  tenantId: number,
  warehouseId: number,
  configId: number,
): Promise<{ ok: boolean; action: string }> {
  const res = await api.delete<{ ok: boolean; action: string }>(
    `/wms/settings/production-configs/${configId}`,
    { params: { tenant_id: tenantId, warehouse_id: warehouseId } },
  );
  return res.data;
}
