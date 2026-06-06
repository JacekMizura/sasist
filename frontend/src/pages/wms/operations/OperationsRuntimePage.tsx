import { OperationsPulpit } from "../../../components/operations/dashboard/OperationsPulpit";
import { useOperationalAlerts } from "../../../hooks/runtime/useOperationalAlerts";
import { useOperatorRuntime } from "../../../hooks/runtime/useOperatorRuntime";
import { useReplenishmentTasks } from "../../../hooks/runtime/useReplenishmentTasks";
import { useRuntimeEvents } from "../../../hooks/runtime/useRuntimeEvents";
import { useZonePressure } from "../../../hooks/runtime/useZonePressure";
import { useRuntimeTasks } from "../../../hooks/tasks/useRuntimeTasks";
import { useOperationalRuntime } from "../../../hooks/runtime/useOperationalRuntime";

export default function OperationsRuntimePage() {
  const { feedLines } = useRuntimeEvents();
  const { openCount } = useReplenishmentTasks();
  const { alerts, ack } = useOperationalAlerts();
  const { selfSnapshot, peers } = useOperatorRuntime();
  const { zones } = useZonePressure();
  const { tasks } = useRuntimeTasks();
  const { runtimeAvailable } = useOperationalRuntime();

  const tasksToday = tasks.filter((t) => {
    const d = t.created_at ? new Date(t.created_at) : null;
    if (!d) return false;
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  return (
    <OperationsPulpit
      alerts={alerts}
      replenishmentOpen={openCount}
      self={selfSnapshot}
      peers={peers}
      zones={zones}
      tasksToday={tasksToday}
      feedLines={feedLines}
      runtimePreview={!runtimeAvailable}
      onAckAlert={(id) => void ack(id)}
    />
  );
}
