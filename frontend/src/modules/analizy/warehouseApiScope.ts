/**
 * Wspólny scope magazynu dla API hubu Analizy / Optymalizacji.
 * Źródło: aktywny magazyn z WarehouseContext — bez kopiowania warehouse_id w ekranach.
 */

import { useMemo } from "react";
import { useWarehouse, type Warehouse } from "../../context/WarehouseContext";

export const ANALIZY_DEFAULT_TENANT_ID = 1;

export type WarehouseApiScope = {
  tenantId: number;
  warehouseId: number;
};

export type WarehouseQueryValue = string | number | boolean;

/** Query params: zawsze tenant_id + warehouse_id (+ opcjonalne pola). */
export function buildWarehouseParams(
  scope: WarehouseApiScope,
  extra?: Record<string, WarehouseQueryValue | null | undefined>
): Record<string, WarehouseQueryValue> {
  const params: Record<string, WarehouseQueryValue> = {
    tenant_id: scope.tenantId,
    warehouse_id: scope.warehouseId,
  };
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined || value === null || value === "") continue;
      params[key] = value;
    }
  }
  return params;
}

export type WarehouseApiScopeState = {
  tenantId: number;
  warehouseId: number | null;
  warehouse: Warehouse | null;
  warehouses: Warehouse[];
  /** Gotowy scope albo null (brak aktywnego magazynu). */
  scope: WarehouseApiScope | null;
  /** true gdy kontekst załadowany i jest aktywny magazyn. */
  ready: boolean;
  loading: boolean;
  warehouseRevision: number;
  showWarehouseSelector: boolean;
  /** Przełącza aktywny magazyn w WarehouseContext (SSOT). */
  setWarehouse: (w: Warehouse) => Promise<void>;
  /** Buduje params albo null gdy brak scope. */
  params: (
    extra?: Record<string, WarehouseQueryValue | null | undefined>
  ) => Record<string, WarehouseQueryValue> | null;
};

export function useWarehouseApiScope(
  tenantId: number = ANALIZY_DEFAULT_TENANT_ID
): WarehouseApiScopeState {
  const {
    warehouse,
    warehouses,
    selectedWarehouseId,
    warehousesLoading,
    warehouseRevision,
    showWarehouseSelector,
    setWarehouse,
  } = useWarehouse();

  return useMemo(() => {
    const scope: WarehouseApiScope | null =
      selectedWarehouseId != null
        ? { tenantId, warehouseId: selectedWarehouseId }
        : null;
    return {
      tenantId,
      warehouseId: selectedWarehouseId,
      warehouse,
      warehouses,
      scope,
      ready: !warehousesLoading && scope != null,
      loading: warehousesLoading,
      warehouseRevision,
      showWarehouseSelector,
      setWarehouse,
      params: (extra) => (scope ? buildWarehouseParams(scope, extra) : null),
    };
  }, [
    tenantId,
    selectedWarehouseId,
    warehouse,
    warehouses,
    warehousesLoading,
    warehouseRevision,
    showWarehouseSelector,
    setWarehouse,
  ]);
}
