import { OperationsPulpit } from "../../../components/operations/dashboard/OperationsPulpit";
import { OperationalStatusPanel } from "../../../components/operational/debug/OperationalStatusPanel";
import { useWarehouse } from "../../../context/WarehouseContext";
import { useOperationalStatus } from "../../../hooks/operational/useOperationalStatus";
import { useOperationalAlerts } from "../../../hooks/runtime/useOperationalAlerts";
import { useOperatorRuntime } from "../../../hooks/runtime/useOperatorRuntime";
import { useOperationalRuntime } from "../../../hooks/runtime/useOperationalRuntime";
import { useReplenishmentTasks } from "../../../hooks/runtime/useReplenishmentTasks";
import { useRuntimeEvents } from "../../../hooks/runtime/useRuntimeEvents";
import { useZonePressure } from "../../../hooks/runtime/useZonePressure";
import { useRuntimeTasks } from "../../../hooks/tasks/useRuntimeTasks";

export default function OperationsRuntimePage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { feedLines } = useRuntimeEvents();
  const { openCount } = useReplenishmentTasks();
  const { alerts, ack } = useOperationalAlerts();
  const { selfSnapshot, peers } = useOperatorRuntime();
  const { zones } = useZonePressure();
  const { tasks } = useRuntimeTasks();
  const runtime = useOperationalRuntime();
  const status = useOperationalStatus({
    warehouseId,
    health: runtime.health,
    connected: runtime.connected,
    liveMode: runtime.liveMode,
  });

  const tasksToday = tasks.filter((t) => {
    const d = t.created_at ? new Date(t.created_at) : null;
    if (!d) return false;
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {status.showDebug ? (
        <div className="shrink-0 px-2 pt-2">
          <OperationalStatusPanel
            features={status.features}
            debugBundle={status.debugBundle}
            backendReachable={runtime.backendReachable}
            sseStatus={status.sseStatus}
            onRefresh={() => void status.refreshDebug()}
          />
        </div>
      ) : null}
      <OperationsPulpit
        alerts={alerts}
        replenishmentOpen={openCount}
        self={selfSnapshot}
        peers={peers}
        zones={zones}
        tasksToday={tasksToday}
        feedLines={feedLines}
        runtimePreview={!runtime.runtimeAvailable}
        onAckAlert={(id) => void ack(id)}
      />
    </div>
  );
}
