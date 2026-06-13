/** Per-warehouse product slotting (assigned_locations SSOT). */

import api from "./axios";
import type { AssignedLocation } from "../types/warehouse";

const DEFAULT_TENANT_ID = 1;

export type ProductSlottingRead = {
  product_id: number;
  warehouse_id: number;
  tenant_id: number;
  assigned_locations: AssignedLocation[];
};

export async function getProductWarehouseSlotting(
  productId: number,
  warehouseId: number,
  tenantId = DEFAULT_TENANT_ID,
): Promise<ProductSlottingRead> {
  const { data } = await api.get<ProductSlottingRead>(`/products/${productId}/slotting`, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return data;
}

export async function putProductWarehouseSlotting(
  productId: number,
  warehouseId: number,
  assignedLocations: AssignedLocation[],
  tenantId = DEFAULT_TENANT_ID,
): Promise<ProductSlottingRead> {
  const { data } = await api.put<ProductSlottingRead>(
    `/products/${productId}/slotting`,
    { assigned_locations: assignedLocations },
    { params: { tenant_id: tenantId, warehouse_id: warehouseId } },
  );
  return data;
}

export async function getWarehouseProductSlottingBulk(
  warehouseId: number,
  tenantId = DEFAULT_TENANT_ID,
): Promise<Map<number, AssignedLocation[]>> {
  const { data } = await api.get<{
    warehouse_id: number;
    tenant_id: number;
    items: Array<{ product_id: number; assigned_locations: AssignedLocation[] }>;
  }>("/products/slotting", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  const map = new Map<number, AssignedLocation[]>();
  for (const item of data.items ?? []) {
    map.set(item.product_id, item.assigned_locations ?? []);
  }
  return map;
}
