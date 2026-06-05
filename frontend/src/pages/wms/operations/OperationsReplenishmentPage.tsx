import { useCallback } from "react";

import { ReplenishmentQueue } from "../../../components/operations/ReplenishmentQueue";
import { assignOperationalTask, transitionOperationalTask } from "../../../api/operationalOrchestrationApi";
import { useAuth } from "../../../context/AuthContext";
import { useReplenishmentTasks } from "../../../hooks/runtime/useReplenishmentTasks";
import { DAMAGE_TENANT_ID } from "../../../constants/panelTenant";

export default function OperationsReplenishmentPage() {
  const { user } = useAuth();
  const { tasks, loading, scanning, runScan, refresh, runtimeAvailable } = useReplenishmentTasks();

  const onAssign = useCallback(
    async (taskId: number) => {
      if (!user?.id) return;
      await assignOperationalTask(DAMAGE_TENANT_ID, taskId, user.id);
      await refresh();
    },
    [user?.id, refresh],
  );

  const onStart = useCallback(
    async (taskId: number) => {
      await transitionOperationalTask(DAMAGE_TENANT_ID, taskId, "ACTIVE");
      await refresh();
    },
    [refresh],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold text-slate-900">Uzupełnienia operacyjne</h1>
        <button
          type="button"
          disabled={!runtimeAvailable || scanning}
          onClick={() => void runScan()}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {scanning ? "Skanowanie…" : "Skanuj reguły"}
        </button>
      </div>
      {!runtimeAvailable ? (
        <p className="text-sm text-amber-800">
          Silnik uzupełnień wyłączony (FEATURE_REPLENISHMENT_ENGINE). Klasyczny WMS działa normalnie.
        </p>
      ) : null}
      <ReplenishmentQueue tasks={tasks} loading={loading} onAssign={onAssign} onStart={onStart} />
    </div>
  );
}
