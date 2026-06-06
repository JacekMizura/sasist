import { useCallback, useEffect, useMemo, useState } from "react";

import { listWmsOperationalTasks, type WmsOperationalTaskApi } from "../../api/wmsOperationalTasksApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { orchColumn } from "../../utils/replenishmentRowModel";
import { useOperationalRuntime } from "../runtime/useOperationalRuntime";

export type TaskGroupBy = "zone" | "operator" | "task_type" | "priority" | "sla";

export const BOARD_COLUMNS = [
  "QUEUED",
  "ASSIGNED",
  "ACTIVE",
  "BLOCKED",
  "WAITING",
  "COMPLETED",
] as const;

export function useRuntimeTasks() {
  const { warehouseId, subscribe } = useOperationalRuntime();
  const [tasks, setTasks] = useState<WmsOperationalTaskApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupBy, setGroupBy] = useState<TaskGroupBy>("task_type");

  const refresh = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    try {
      const res = await listWmsOperationalTasks(DAMAGE_TENANT_ID, warehouseId, { limit: 120, sync: true });
      setTasks(res.items);
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
    return subscribe(() => void refresh());
  }, [subscribe, refresh]);

  const byColumn = useMemo(() => {
    const map = new Map<string, WmsOperationalTaskApi[]>();
    for (const col of BOARD_COLUMNS) map.set(col, []);
    for (const t of tasks) {
      const col = orchColumn(t);
      const bucket = map.get(col) ?? map.get("QUEUED")!;
      bucket.push(t);
    }
    return map;
  }, [tasks]);

  const patchTaskOptimistic = useCallback((taskId: number, patch: Partial<WmsOperationalTaskApi>) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  }, []);

  return { tasks, loading, groupBy, setGroupBy, byColumn, refresh, patchTaskOptimistic };
}
