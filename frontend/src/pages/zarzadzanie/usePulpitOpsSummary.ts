import { useEffect, useState } from "react";
import {
  getWarehouseOperationsSnapshot,
  type WarehouseOperationsSummary,
} from "../../api/warehouseOperationsApi";

const TENANT_ID = 1;

/** Lekki snapshot pod Pulpit — bez pełnego Centrum Operacyjnego. */
export function usePulpitOpsSummary(warehouseId: number | null) {
  const [summary, setSummary] = useState<WarehouseOperationsSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (warehouseId == null || warehouseId < 1) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getWarehouseOperationsSnapshot({
      tenantId: TENANT_ID,
      warehouseId,
      shortBreakMinutes: 5,
      longBreakMinutes: 10,
    })
      .then((snap) => {
        if (!cancelled) setSummary(snap?.summary ?? null);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [warehouseId]);

  return { summary, loading };
}
