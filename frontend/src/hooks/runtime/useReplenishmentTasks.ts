import { useCallback, useEffect, useMemo, useState } from "react";

import { scanReplenishment } from "../../api/operationalReplenishmentApi";
import {
  listWmsOperationalTasks,
  type WmsOperationalTaskApi,
} from "../../api/wmsOperationalTasksApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { useOperationalRuntime } from "./useOperationalRuntime";

const REPLENISHMENT_TYPES = new Set([
  "REPLENISHMENT",
  "PICKFACE_REFILL",
  "SHOWROOM_REFILL",
  "COUNTER_TRANSFER",
]);

export function useReplenishmentTasks() {
  const { warehouseId, runtimeAvailable, subscribe } = useOperationalRuntime();
  const [tasks, setTasks] = useState<WmsOperationalTaskApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);

  const refresh = useCallback(async () => {
    if (warehouseId == null) {
      setTasks([]);
      return;
    }
    setLoading(true);
    try {
      const res = await listWmsOperationalTasks(DAMAGE_TENANT_ID, warehouseId, {
        queue: "DO_ROZLOKOWANIA",
        limit: 80,
        sync: true,
      });
      const repl = res.items.filter((t) => REPLENISHMENT_TYPES.has(t.task_type));
      setTasks(repl);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribe((ev) => {
      if (ev.event_type.startsWith("replenishment") || ev.event_type.startsWith("task.")) {
        void refresh();
      }
    });
  }, [subscribe, refresh]);

  const runScan = useCallback(async () => {
    if (warehouseId == null || !runtimeAvailable) return null;
    setScanning(true);
    try {
      const result = await scanReplenishment(DAMAGE_TENANT_ID, warehouseId);
      await refresh();
      return result;
    } finally {
      setScanning(false);
    }
  }, [warehouseId, runtimeAvailable, refresh]);

  const openCount = useMemo(() => tasks.filter((t) => t.status !== "done").length, [tasks]);

  return { tasks, loading, scanning, openCount, refresh, runScan, runtimeAvailable };
}
