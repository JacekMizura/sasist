import { AlertsPanel } from "../../../components/operations/AlertsPanel";
import { OperationsSidebar } from "../../../components/operations/OperationsSidebar";
import { OperatorRuntimePanel } from "../../../components/operations/OperatorRuntimePanel";
import { ReplenishmentQueue } from "../../../components/operations/ReplenishmentQueue";
import { RuntimeTaskFeed } from "../../../components/operations/RuntimeTaskFeed";
import { ZonePressureCards } from "../../../components/operations/ZonePressureCards";
import { useOperationalAlerts } from "../../../hooks/runtime/useOperationalAlerts";
import { useOperatorRuntime } from "../../../hooks/runtime/useOperatorRuntime";
import { useReplenishmentTasks } from "../../../hooks/runtime/useReplenishmentTasks";
import { useRuntimeEvents } from "../../../hooks/runtime/useRuntimeEvents";
import { useZonePressure } from "../../../hooks/runtime/useZonePressure";

export default function OperationsRuntimePage() {
  const { feedLines } = useRuntimeEvents();
  const { tasks, openCount } = useReplenishmentTasks();
  const { alerts, ack } = useOperationalAlerts();
  const { selfSnapshot, peers } = useOperatorRuntime();
  const { zones } = useZonePressure();

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2 md:flex-row md:p-3">
      <OperationsSidebar replenishmentCount={openCount} alertCount={alerts.length} />
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <h1 className="text-base font-semibold text-slate-900">Operacje — runtime na żywo</h1>
        <RuntimeTaskFeed lines={feedLines} />
        <ReplenishmentQueue tasks={tasks} compact />
      </section>
      <aside className="flex w-full shrink-0 flex-col gap-2 md:w-56">
        <ZonePressureCards zones={zones} />
        <OperatorRuntimePanel self={selfSnapshot} peers={peers} />
        <AlertsPanel alerts={alerts} compact onAck={(id) => void ack(id)} />
      </aside>
    </div>
  );
}
