import { Outlet } from "react-router-dom";

import { OperationsSubNav } from "../../../components/operations/OperationsSubNav";
import { RuntimeStatusBar } from "../../../components/operations/RuntimeStatusBar";
import { useOperationalRuntime } from "../../../hooks/runtime/useOperationalRuntime";

export default function OperationsLayout() {
  const runtime = useOperationalRuntime();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <OperationsSubNav />
      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet context={runtime} />
      </div>
      <RuntimeStatusBar
        health={runtime.health}
        connected={runtime.connected}
        eventLagMs={runtime.eventLagMs}
        lastEventId={runtime.lastEventId}
        runtimeAvailable={runtime.runtimeAvailable}
      />
    </div>
  );
}
