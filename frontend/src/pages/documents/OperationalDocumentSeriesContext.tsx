import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  fetchOperationalDocumentCatalog,
  type OperationalDocumentCatalogDto,
  type OperationalDocumentSeriesDto,
} from "../../api/documentSeriesApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";

type OperationalDocumentSeriesContextValue = {
  tenantId: number;
  warehouseId: number | null;
  catalog: OperationalDocumentCatalogDto | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  warehouseTypes: OperationalDocumentSeriesDto[];
  saleTypes: OperationalDocumentSeriesDto[];
  correctionTypes: OperationalDocumentSeriesDto[];
  hasWarehouseType: (code: string) => boolean;
  firstWarehousePath: string | null;
};

const OperationalDocumentSeriesContext = createContext<OperationalDocumentSeriesContextValue | null>(null);

export function OperationalDocumentSeriesProvider({ children }: { children: ReactNode }) {
  const { warehouse } = useWarehouse();
  const tenantId = DAMAGE_TENANT_ID;
  const warehouseId = warehouse?.id ?? null;

  const [catalog, setCatalog] = useState<OperationalDocumentCatalogDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (warehouseId == null) {
      setCatalog(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setCatalog(await fetchOperationalDocumentCatalog(tenantId, warehouseId));
    } catch {
      setError("Nie udało się wczytać katalogu serii dokumentów.");
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const warehouseTypes = useMemo(
    () => (catalog?.items ?? []).filter((i) => i.series_type === "WAREHOUSE" && i.is_active),
    [catalog],
  );
  const saleTypes = useMemo(
    () => (catalog?.items ?? []).filter((i) => i.series_type === "SALE" && i.is_active),
    [catalog],
  );
  const correctionTypes = useMemo(
    () => (catalog?.items ?? []).filter((i) => i.series_type === "CORRECTION" && i.is_active),
    [catalog],
  );

  const value = useMemo<OperationalDocumentSeriesContextValue>(
    () => ({
      tenantId,
      warehouseId,
      catalog,
      loading,
      error,
      refresh,
      warehouseTypes,
      saleTypes,
      correctionTypes,
      hasWarehouseType: (code: string) => {
        const c = code.trim().toUpperCase().replace(/-/g, "_");
        return warehouseTypes.some((t) => {
          const stock = (t.stock_document_type ?? "").trim().toUpperCase().replace(/-/g, "_");
          const op = t.operational_code.trim().toUpperCase().replace(/-/g, "_");
          return stock === c || op === c;
        });
      },
      firstWarehousePath: (() => {
        const order = ["MM", "PZ", "PW", "RW", "WZ", "ZD", "Z-PZ"];
        for (const label of order) {
          const hit = warehouseTypes.find((t) => t.operational_code.toUpperCase() === label);
          if (hit?.list_path) return hit.list_path;
        }
        return warehouseTypes[0]?.list_path ?? null;
      })(),
    }),
    [tenantId, warehouseId, catalog, loading, error, refresh, warehouseTypes, saleTypes, correctionTypes],
  );

  return (
    <OperationalDocumentSeriesContext.Provider value={value}>{children}</OperationalDocumentSeriesContext.Provider>
  );
}

export function useOperationalDocumentSeries(): OperationalDocumentSeriesContextValue {
  const ctx = useContext(OperationalDocumentSeriesContext);
  if (!ctx) {
    throw new Error("useOperationalDocumentSeries must be used within OperationalDocumentSeriesProvider");
  }
  return ctx;
}
