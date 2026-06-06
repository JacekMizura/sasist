import { useState } from "react";
import { Outlet } from "react-router-dom";

import { OperationsErrorFallback } from "../../../components/operations/OperationsErrorFallback";
import { OperationsSubNav } from "../../../components/operations/OperationsSubNav";
import { RuntimeStatusBar } from "../../../components/operations/RuntimeStatusBar";
import ErrorBoundary from "../../../components/ErrorBoundary";
import { useOperationalRuntime } from "../../../hooks/runtime/useOperationalRuntime";

export default function OperationsLayout() {
  const runtime = useOperationalRuntime();
  const [retryKey, setRetryKey] = useState(0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <OperationsSubNav />
      <div className="min-h-0 flex-1 overflow-hidden">
        <ErrorBoundary
          key={retryKey}
          fallback={
            <OperationsErrorFallback onRetry={() => setRetryKey((k) => k + 1)} />
          }
        >
          <Outlet context={runtime} />
        </ErrorBoundary>
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
