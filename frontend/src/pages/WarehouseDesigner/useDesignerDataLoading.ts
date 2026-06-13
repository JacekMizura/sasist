import { useCallback, useEffect, useRef } from "react";
import api from "../../api/axios";
import { fetchWarehouseOccupancyMetrics, type WarehouseOccupancyMetrics } from "../../api/warehouseOccupancyApi";
import type { LayoutState, WarehouseProduct } from "../../types/warehouse";
import { getDesignerLoadPerf, isDesignerPerfEnabled } from "./designerLoadPerf";
import type { InventoryRow } from "./inventoryMaps";
import { mapApiProductsToWarehouseProducts } from "./mapApiProductsToWarehouseProducts";

const TENANT_ID = 1;

type MainView = "magazyn" | "layout";

export function useDesignerDataLoading(params: {
  selectedWarehouseId: number | null;
  mainView: MainView;
  layout: LayoutState;
  setInventoryRows: (rows: InventoryRow[]) => void;
  setOccupancyMetrics: (m: WarehouseOccupancyMetrics | null) => void;
  setProducts: (products: WarehouseProduct[]) => void;
  onWarehouseDataReset: () => void;
}) {
  const {
    selectedWarehouseId,
    mainView,
    layout,
    setInventoryRows,
    setOccupancyMetrics,
    setProducts,
    onWarehouseDataReset,
  } = params;

  const magazynBootstrappedWhRef = useRef<number | null>(null);
  const productsLoadedWhRef = useRef<number | null>(null);
  const productsLoadInFlightRef = useRef(false);
  const inventoryLoadInFlightRef = useRef(false);
  const occupancyLoadInFlightRef = useRef(false);

  const resetWarehouseDataRefs = useCallback(() => {
    magazynBootstrappedWhRef.current = null;
    productsLoadedWhRef.current = null;
    productsLoadInFlightRef.current = false;
    inventoryLoadInFlightRef.current = false;
    occupancyLoadInFlightRef.current = false;
    onWarehouseDataReset();
  }, [onWarehouseDataReset]);

  const fetchInventory = useCallback(
    async (warehouseId: number) => {
      if (inventoryLoadInFlightRef.current) return;
      inventoryLoadInFlightRef.current = true;
      const perf = getDesignerLoadPerf(isDesignerPerfEnabled());
      const t0 = performance.now();
      perf?.start("GET /inventory/");
      try {
        const inventoryRes = await api.get<InventoryRow[]>("/inventory/", {
          params: { tenant_id: TENANT_ID, warehouse_id: warehouseId, hide_technical_locations: false },
        });
        setInventoryRows(Array.isArray(inventoryRes.data) ? inventoryRes.data : []);
      } catch {
        setInventoryRows([]);
      } finally {
        perf?.record("GET /inventory/", performance.now() - t0);
        perf?.end("GET /inventory/");
        inventoryLoadInFlightRef.current = false;
      }
    },
    [setInventoryRows],
  );

  const fetchOccupancy = useCallback(
    async (warehouseId: number) => {
      if (occupancyLoadInFlightRef.current) return;
      occupancyLoadInFlightRef.current = true;
      const perf = getDesignerLoadPerf(isDesignerPerfEnabled());
      const t0 = performance.now();
      perf?.start("GET /warehouse/occupancy-metrics");
      try {
        const data = await fetchWarehouseOccupancyMetrics(TENANT_ID, warehouseId);
        setOccupancyMetrics(data);
      } catch {
        setOccupancyMetrics(null);
      } finally {
        perf?.record("GET /warehouse/occupancy-metrics", performance.now() - t0);
        perf?.end("GET /warehouse/occupancy-metrics");
        occupancyLoadInFlightRef.current = false;
      }
    },
    [setOccupancyMetrics],
  );

  /** Inventory + occupancy once per warehouse when entering Magazyn view. */
  const bootstrapMagazynStock = useCallback(
    async (warehouseId: number) => {
      if (magazynBootstrappedWhRef.current === warehouseId) return;
      magazynBootstrappedWhRef.current = warehouseId;
      const perf = getDesignerLoadPerf(isDesignerPerfEnabled());
      perf?.start("bootstrapMagazynStock");
      try {
        await Promise.all([fetchInventory(warehouseId), fetchOccupancy(warehouseId)]);
      } finally {
        perf?.end("bootstrapMagazynStock");
      }
    },
    [fetchInventory, fetchOccupancy],
  );

  /** After putaway / slotting — refresh stock metrics; no duplicate layout/products. */
  const refreshMagazynStock = useCallback(
    async (warehouseId: number) => {
      await Promise.all([fetchInventory(warehouseId), fetchOccupancy(warehouseId)]);
    },
    [fetchInventory, fetchOccupancy],
  );

  const loadDesignerProducts = useCallback(
    async (
      warehouseId: number,
      layoutForMap: LayoutState,
      options?: { force?: boolean },
    ): Promise<WarehouseProduct[] | null> => {
      if (productsLoadInFlightRef.current) return null;
      if (!options?.force && productsLoadedWhRef.current === warehouseId) return null;
      productsLoadInFlightRef.current = true;
      const perf = getDesignerLoadPerf(isDesignerPerfEnabled());
      perf?.start("GET /products/ (lazy)");
      const t0 = performance.now();
      try {
        const prodRes = await api.get("/products/", {
          params: { tenant_id: TENANT_ID, limit: 5000, warehouse_id: warehouseId },
        });
        const raw = prodRes.data?.items ?? (Array.isArray(prodRes.data) ? prodRes.data : []);
        const list = mapApiProductsToWarehouseProducts(raw as Record<string, unknown>[], layoutForMap);
        setProducts(list);
        productsLoadedWhRef.current = warehouseId;
        return list;
      } catch {
        return null;
      } finally {
        perf?.record("GET /products/", performance.now() - t0);
        perf?.end("GET /products/ (lazy)");
        productsLoadInFlightRef.current = false;
      }
    },
    [setProducts],
  );

  useEffect(() => {
    if (mainView !== "magazyn" || selectedWarehouseId == null) return;
    void bootstrapMagazynStock(selectedWarehouseId);
  }, [mainView, selectedWarehouseId, bootstrapMagazynStock]);

  useEffect(() => {
    if (selectedWarehouseId == null) {
      magazynBootstrappedWhRef.current = null;
      productsLoadedWhRef.current = null;
    }
  }, [selectedWarehouseId]);

  return {
    bootstrapMagazynStock,
    refreshMagazynStock,
    loadDesignerProducts,
    resetWarehouseDataRefs,
    isProductsCatalogLoaded: productsLoadedWhRef.current === selectedWarehouseId,
  };
}
