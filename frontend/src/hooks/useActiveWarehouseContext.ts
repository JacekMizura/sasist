import { useCallback } from "react";

import { useWarehouse } from "../context/WarehouseContext";

/** Standard message when an action requires the global active warehouse. */
export const ACTIVE_WAREHOUSE_REQUIRED_MESSAGE = "Wybierz aktywny magazyn.";

/**
 * Active warehouse from {@link WarehouseContext} — SSOT for warehouse_id on create flows.
 * Syncs with backend profile via GlobalWarehouseSelect / setActiveWarehouse.
 */
export function useActiveWarehouseContext() {
  const { warehouse, selectedWarehouseId, warehousesLoading, showWarehouseSelector, warehouses } = useWarehouse();

  const warehouseId = selectedWarehouseId;
  const hasActiveWarehouse = warehouseId != null;

  const requireWarehouseId = useCallback((): number | null => {
    return warehouseId;
  }, [warehouseId]);

  return {
    warehouse,
    warehouseId,
    warehouseName: warehouse?.name ?? null,
    hasActiveWarehouse,
    warehousesLoading,
    showWarehouseSelector,
    warehouses,
    message: ACTIVE_WAREHOUSE_REQUIRED_MESSAGE,
    requireWarehouseId,
  };
}
