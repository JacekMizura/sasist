import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import api from "../api/axios";

export type Warehouse = {
  id: number;
  name: string;
};

type WarehouseContextType = {
  /** Currently selected warehouse (persisted in localStorage when set). */
  warehouse: Warehouse | null;
  /** Convenience: ``warehouse?.id ?? null`` for API params / disabled states. */
  selectedWarehouseId: number | null;
  setWarehouse: (w: Warehouse) => void;
  /** All warehouses for the tenant (from GET /warehouses/). */
  warehouses: Warehouse[];
  warehousesLoading: boolean;
  /** True when more than one warehouse exists — show global header selector. */
  showWarehouseSelector: boolean;
  /** Refetch list after creating a warehouse, etc. */
  refreshWarehouses: () => Promise<void>;
};

const WarehouseContext = createContext<WarehouseContextType | undefined>(undefined);

const STORAGE_KEY = "warehouse";

function readStoredWarehouse(): Warehouse | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    console.log("[LS]", STORAGE_KEY, raw);
    if (!raw) return null;
    let p: Warehouse;
    try {
      p = JSON.parse(raw) as Warehouse;
    } catch (e) {
      console.error("[LS] warehouse JSON.parse failed", STORAGE_KEY, e);
      return null;
    }
    return p && typeof p.id === "number" && typeof p.name === "string" ? p : null;
  } catch {
    return null;
  }
}

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouse, setWarehouseState] = useState<Warehouse | null>(() => readStoredWarehouse());
  const [loading, setLoading] = useState(true);

  const setWarehouse = useCallback((w: Warehouse) => {
    setWarehouseState(w);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
  }, []);

  const applySelectionForList = useCallback(
    (list: Warehouse[]) => {
      if (list.length === 0) {
        setWarehouseState(null);
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      if (list.length === 1) {
        setWarehouse(list[0]);
        return;
      }
      const saved = readStoredWarehouse();
      const valid = saved != null && list.some((x) => x.id === saved.id);
      if (valid && saved) {
        setWarehouseState(saved);
        return;
      }
      setWarehouse(list[0]);
    },
    [setWarehouse],
  );

  const refreshWarehouses = useCallback(async () => {
    const res = await api.get<Warehouse[]>("/warehouses/");
    const list = Array.isArray(res.data) ? res.data : [];
    setWarehouses(list);
    applySelectionForList(list);
  }, [applySelectionForList]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Warehouse[]>("/warehouses/")
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setWarehouses(list);
        applySelectionForList(list);
      })
      .catch(() => {
        if (!cancelled) setWarehouses([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applySelectionForList]);

  const showWarehouseSelector = warehouses.length > 1;

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
