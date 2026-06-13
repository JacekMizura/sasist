/**
 * CRUD i zbiorczy zapis ``picking_config`` (ustawienia WMS + źródło prawdy dla listy statusów zbierania).
 */
import api from "./axios";

export type PickingConfigModeDb = "bulk" | "scanned" | "baskets" | "mobile" | "consolidation_rack";
export type PickingConfigStrategyDb = "locations" | "orders";
export type PickingConfigPickUnitDb = "orders" | "products";
export type PickingConfigOrderSortDb = "date" | "location" | "courier";

export type WmsPickingConfigReadApi = {
  id: number;
  tenant_id: number;
  warehouse_id: number;
  source_status_id: number;
  target_status_id: number;
  status_on_shortage_id?: number | null;
  strategy: PickingConfigStrategyDb;
  pick_unit: PickingConfigPickUnitDb;
  order_sort: PickingConfigOrderSortDb;
  single_mode: PickingConfigModeDb;
  multi_mode: PickingConfigModeDb;
  max_single_orders: number | null;
  max_multi_orders: number | null;
  created_at: string;
  source_status_name?: string | null;
  target_status_name?: string | null;
};

export type WmsPickingConfigReplaceItem = {
  source_status_id: number;
  target_status_id: number;
  status_on_shortage_id?: number | null;
  single_mode: PickingConfigModeDb;
  multi_mode: PickingConfigModeDb;
  pick_unit: PickingConfigPickUnitDb;
  order_sort: PickingConfigOrderSortDb;
  max_single_orders?: number | null;
  max_multi_orders?: number | null;
};

export async function listPickingConfigs(
  tenantId: number,
  warehouseId: number,
): Promise<WmsPickingConfigReadApi[]> {
  const res = await api.get<{ items: WmsPickingConfigReadApi[] }>("/wms/picking-config", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data.items;
}

/** Zastępuje całą konfigurację magazynu; zwraca aktualną listę z serwera. */
export async function replacePickingConfigsForWarehouse(
  tenantId: number,
  warehouseId: number,
  items: WmsPickingConfigReplaceItem[],
): Promise<WmsPickingConfigReadApi[]> {
  const res = await api.post<{ items: WmsPickingConfigReadApi[] }>(
    "/wms/picking/config",
    { items },
    {
      params: { tenant_id: tenantId, warehouse_id: warehouseId },
    },
  );
  return res.data.items;
}
