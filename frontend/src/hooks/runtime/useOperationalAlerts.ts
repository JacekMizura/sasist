import { useCallback, useEffect, useState } from "react";

import {
  ackOperationalAlert,
  fetchOperationalAlerts,
  type OperationalAlert,
} from "../../api/operationalAlertsApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { useOperationalRuntime } from "./useOperationalRuntime";

export function useOperationalAlerts() {
  const { warehouseId, runtimeAvailable, subscribe } = useOperationalRuntime();
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (warehouseId == null || !runtimeAvailable) {
      setAlerts([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchOperationalAlerts(DAMAGE_TENANT_ID, warehouseId);
      setAlerts(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się załadować alertów");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, runtimeAvailable]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribe(() => void refresh());
  }, [subscribe, refresh]);

  const ack = useCallback(
    async (alertId: number) => {
      await ackOperationalAlert(DAMAGE_TENANT_ID, alertId);
      await refresh();
    },
    [refresh],
  );

  return { alerts, loading, error, refresh, ack, runtimeAvailable };
}
