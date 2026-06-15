import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  fetchWarehouseContext,
  setActiveWarehouse as setActiveWarehouseApi,
  type WarehouseContextResponse,
} from "../api/authApi";
import { applyWarehouseContext } from "./warehouseContextLogic";
import { dispatchWmsWarehouseChanged } from "../wms/wmsWarehouseChange";
import { useAuth } from "./AuthContext";

export type Warehouse = {
  id: number;
  name: string;
  requires_putaway: boolean;
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
  /** Increments after successful active-warehouse switch — use in refetch deps. */
  warehouseRevision: number;
  /** P2.5C — false hides putaway module for simple warehouses. */
  activeWarehouseRequiresPutaway: boolean;
};

const WarehouseContext = createContext<WarehouseContextType | undefined>(undefined);

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const { sessionReady } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouse, setWarehouseState] = useState<Warehouse | null>(null);
  const [showWarehouseSelector, setShowWarehouseSelector] = useState(false);
  const [activeWarehouseRequiresPutaway, setActiveWarehouseRequiresPutaway] = useState(true);
  const [loading, setLoading] = useState(true);
  const [warehouseRevision, setWarehouseRevision] = useState(0);

  const applyFromServer = useCallback((ctx: WarehouseContextResponse) => {
    const { list, active, showSelector, activeRequiresPutaway } = applyWarehouseContext(ctx);
    setWarehouses(list);
    setWarehouseState(active);
    setShowWarehouseSelector(showSelector);
    setActiveWarehouseRequiresPutaway(activeRequiresPutaway);
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
      setWarehouseRevision((r) => r + 1);
      dispatchWmsWarehouseChanged(w.id);
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
      warehouseRevision,
      activeWarehouseRequiresPutaway,
    }),
    [
      warehouse,
      selectedWarehouseId,
      setWarehouse,
      warehouses,
      loading,
      showWarehouseSelector,
      refreshWarehouses,
      warehouseRevision,
      activeWarehouseRequiresPutaway,
    ],
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
