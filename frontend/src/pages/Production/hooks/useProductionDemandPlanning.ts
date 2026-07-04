import { useCallback, useEffect, useState } from "react";

import {
  fetchProductionDemandPlanning,
  type ProductionDemandPlanning,
} from "@/api/productionPlanningApi";

const DEFAULT_COVERAGE_DAYS = 21;

export function useProductionDemandPlanning(tenantId: number, warehouseId: number | null) {
  const [coverageDays, setCoverageDays] = useState(DEFAULT_COVERAGE_DAYS);
  const [customCoverageInput, setCustomCoverageInput] = useState("");
  const [data, setData] = useState<ProductionDemandPlanning | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    setError(null);
    try {
      const snap = await fetchProductionDemandPlanning({
        tenantId,
        warehouseId,
        coverageDays,
      });
      setData(snap);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Nie udało się wczytać planowania zapotrzebowania.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, coverageDays]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const applyCustomCoverage = useCallback(() => {
    const n = parseInt(customCoverageInput.trim(), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 365) {
      setCoverageDays(n);
    }
  }, [customCoverageInput]);

  return {
    data,
    loading,
    error,
    coverageDays,
    setCoverageDays,
    customCoverageInput,
    setCustomCoverageInput,
    applyCustomCoverage,
    reload,
  };
}
