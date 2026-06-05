import { useCallback, useEffect, useState } from "react";

import { TaskOrchestrationBoard } from "../../../components/operations/TaskOrchestrationBoard";
import { listWmsOperationalTasks, type WmsOperationalTaskApi } from "../../../api/wmsOperationalTasksApi";
import { DAMAGE_TENANT_ID } from "../../../constants/panelTenant";
import { useWarehouse } from "../../../context/WarehouseContext";
import { useOperationalRuntime } from "../../../hooks/runtime/useOperationalRuntime";

export default function OperationsTasksPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { subscribe } = useOperationalRuntime();
  const [tasks, setTasks] = useState<WmsOperationalTaskApi[]>([]);

  const refresh = useCallback(async () => {
    if (warehouseId == null) return;
    const res = await listWmsOperationalTasks(DAMAGE_TENANT_ID, warehouseId, { limit: 100, sync: true });
    setTasks(res.items);
  }, [warehouseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribe(() => void refresh());
  }, [subscribe, refresh]);

  return (
    <div className="space-y-3 p-3">
      <h1 className="text-base font-semibold text-slate-900">Orchestracja zadań</h1>
      <TaskOrchestrationBoard tasks={tasks} />
    </div>
  );
}
