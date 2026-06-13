import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  fetchWarehouseContext,
  setActiveWarehouse as setActiveWarehouseApi,
  type WarehouseContextResponse,
} from "../api/authApi";
import { useAuth } from "./AuthContext";

export type Warehouse = {
  id: number;
  name: string;
};

type WarehouseContextType = {
  /** Currently active warehouse (server-validated). */
  warehouse: Warehouse | null;
  selectedWarehouseId: number | null;
  setWarehouse: (w: Warehouse) => Promise<void>;
  /** Warehouses the user may operate on. */
  warehouses: Warehouse[];
  warehousesLoading: boolean;
  showWarehouseSelector: boolean;
  refreshWarehouses: () => Promise<void>;
};

const WarehouseContext = createContext<WarehouseContextType | undefined>(undefined);

function pickActive(list: Warehouse[], activeId: number | null | undefined): Warehouse | null {
  if (activeId != null) {
    const hit = list.find((w) => w.id === activeId);
    if (hit) return hit;
  }
  return list[0] ?? null;
}

function applyContext(
  ctx: WarehouseContextResponse,
): { list: Warehouse[]; active: Warehouse | null; showSelector: boolean } {
  const list = ctx.warehouses ?? [];
  const active = pickActive(list, ctx.active_warehouse_id);
  return {
    list,
    active,
    showSelector: Boolean(ctx.show_warehouse_selector),
  };
}

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const { sessionReady } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouse, setWarehouseState] = useState<Warehouse | null>(null);
  const [showWarehouseSelector, setShowWarehouseSelector] = useState(false);
  const [loading, setLoading] = useState(true);

  const applyFromServer = useCallback((ctx: WarehouseContextResponse) => {
    const { list, active, showSelector } = applyContext(ctx);
    setWarehouses(list);
    setWarehouseState(active);
    setShowWarehouseSelector(showSelector);
  }, []);

  const refreshWarehouses = useCallback(async () => {
    if (!sessionReady) {
      setWarehouses([]);
      setWarehouseState(null);
      setShowWarehouseSelector(false);
      return;
    }
    setLoading(true);
    try {
      const ctx = await fetchWarehouseContext();
      applyFromServer(ctx);
    } catch {
      setWarehouses([]);
      setWarehouseState(null);
      setShowWarehouseSelector(false);
    } finally {
      setLoading(false);
    }
  }, [applyFromServer, sessionReady]);

  useEffect(() => {
    void refreshWarehouses();
  }, [refreshWarehouses]);

  const setWarehouse = useCallback(
    async (w: Warehouse) => {
      const ctx = await setActiveWarehouseApi(w.id);
      applyFromServer(ctx);
    },
    [applyFromServer],
  );

  const selectedWarehouseId = warehouse?.id ?? null;

  const value = useMemo(
    () => ({
      warehouse,
      selectedWarehouseId,
      setWarehouse,
      warehouses,
      warehousesLoading: loading,
      showWarehouseSelector,
      refreshWarehouses,
    }),
    [warehouse, selectedWarehouseId, setWarehouse, warehouses, loading, showWarehouseSelector, refreshWarehouses],
  );

  return <WarehouseContext.Provider value={value}>{children}</WarehouseContext.Provider>;
}

export function useWarehouse() {
  const context = useContext(WarehouseContext);
  if (!context) {
    throw new Error("useWarehouse must be used inside WarehouseProvider");
  }
  return context;
}
