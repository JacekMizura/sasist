import { useCallback, useEffect, useMemo, useState } from "react";
import { listDeliveries } from "../../../../api/inboundDeliveriesApi";
import {
  getSupplyFlowPlan,
  recomputeSupplyFlowPlan,
  type SupplyFlowLivingPlan,
} from "../../../../api/supplyFlowApi";
import { buildShiftBoard, enrichmentFromDeliveries, type DeliveryEnrichment } from "../utils/shiftBoard";

const TENANT_KEY = "wms.supplyFlow.tenantId";

export function useSupplyFlowPlan(warehouseId: number | null) {
  const [tenantId] = useState(() => {
    const raw = localStorage.getItem(TENANT_KEY);
    const n = raw ? Number(raw) : 1;
    return Number.isFinite(n) && n > 0 ? n : 1;
  });
  const [plan, setPlan] = useState<SupplyFlowLivingPlan | null>(null);
  const [enrichment, setEnrichment] = useState<Record<number, DeliveryEnrichment>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (warehouseId == null || warehouseId < 1) return;
    setLoading(true);
    setError(null);
    try {
      const [data, deliveries] = await Promise.all([
        getSupplyFlowPlan(tenantId, warehouseId),
        listDeliveries(tenantId).catch(() => []),
      ]);
      setPlan(data);
      setEnrichment(enrichmentFromDeliveries(deliveries));
      localStorage.setItem(TENANT_KEY, String(tenantId));
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (e as { message?: string })?.message ||
        "Nie udało się wczytać danych przepływu dostaw";
      setError(String(msg));
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Jedyna akcja użytkownika: odśwież stan (przelicza plan w tle bez żargonu w UI). */
  const refresh = useCallback(async () => {
    if (warehouseId == null || warehouseId < 1) return;
    setRefreshing(true);
    setError(null);
    try {
      const data = await recomputeSupplyFlowPlan(tenantId, warehouseId).catch(() =>
        getSupplyFlowPlan(tenantId, warehouseId),
      );
      setPlan(data);
      const deliveries = await listDeliveries(tenantId).catch(() => []);
      setEnrichment(enrichmentFromDeliveries(deliveries));
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (e as { message?: string })?.message ||
        "Nie udało się odświeżyć danych";
      setError(String(msg));
    } finally {
      setRefreshing(false);
    }
  }, [tenantId, warehouseId]);

  const board = useMemo(() => buildShiftBoard(plan, enrichment), [plan, enrichment]);

  return {
    tenantId,
    plan,
    board,
    loading,
    refreshing,
    error,
    refresh,
  };
}
