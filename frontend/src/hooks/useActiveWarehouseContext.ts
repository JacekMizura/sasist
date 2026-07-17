import { useCallback } from "react";

import { useWarehouse } from "../context/WarehouseContext";
import {
  getOperationPolicy,
  requiresWarehouse,
  type WarehouseOperation,
} from "../lib/warehouseOperationPolicy";

/** Standard message when an action requires the global active warehouse. */
export const ACTIVE_WAREHOUSE_REQUIRED_MESSAGE = "Wybierz aktywny magazyn.";

export { getOperationPolicy, requiresWarehouse };
export type { WarehouseOperation };

/**
 * Active warehouse from {@link WarehouseContext} — SSOT for warehouse_id on WMS create flows.
 * Do not use as a gate for OMS workflow — call {@link getOperationPolicy} first.
 */
export function useActiveWarehouseContext() {
  const { warehouse, selectedWarehouseId, warehousesLoading, showWarehouseSelector, warehouses } = useWarehouse();

  const warehouseId = selectedWarehouseId;
  const hasActiveWarehouse = warehouseId != null;

  /** @deprecated Prefer requireWarehouseFor(operation) — avoids gating OMS by global WH. */
  const requireWarehouseId = useCallback((): number | null => {
    return warehouseId;
  }, [warehouseId]);

  /**
   * Returns warehouse id when the operation requires it and one is selected;
   * returns null when not required (caller may still use warehouseId as optional context).
   * When required and missing → null (caller shows ACTIVE_WAREHOUSE_REQUIRED_MESSAGE).
   */
  const requireWarehouseFor = useCallback(
    (operation: WarehouseOperation): number | null => {
      const policy = getOperationPolicy(operation);
      if (!policy.requiresWarehouse) {
        return warehouseId;
      }
      return warehouseId != null && warehouseId > 0 ? warehouseId : null;
    },
    [warehouseId],
  );

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
    requireWarehouseFor,
    requiresWarehouse,
    getOperationPolicy,
  };
}
