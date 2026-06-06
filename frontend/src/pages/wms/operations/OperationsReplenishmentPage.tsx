import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ReplenishmentExecutionModal } from "../../../components/operations/replenishment/ReplenishmentExecutionModal";
import { ReplenishmentFilters } from "../../../components/operations/replenishment/ReplenishmentFilters";
import { ReplenishmentTable } from "../../../components/operations/replenishment/ReplenishmentTable";
import { useAuth } from "../../../context/AuthContext";
import { useReplenishmentExecution } from "../../../hooks/replenishment/useReplenishmentExecution";
import { useReplenishmentRealtime } from "../../../hooks/replenishment/useReplenishmentRealtime";
import { toReplenishmentRow } from "../../../utils/replenishmentRowModel";
import { WMS_ROUTES } from "../wmsRoutes";

export default function OperationsReplenishmentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tasks, loading, scanning, runScan, refresh, runtimeAvailable } = useReplenishmentRealtime();
  const [statusFilter, setStatusFilter] = useState("all");

  const exec = useReplenishmentExecution(refresh);

  const rows = useMemo(() => {
    const mapped = tasks.map(toReplenishmentRow);
    if (statusFilter === "open") return mapped.filter((r) => !["COMPLETED", "done"].includes(r.taskStatus));
    if (statusFilter === "active") return mapped.filter((r) => ["ACTIVE", "in_progress"].includes(r.taskStatus));
    if (statusFilter === "blocked") return mapped.filter((r) => ["BLOCKED", "blocked"].includes(r.taskStatus));
    return mapped;
  }, [tasks, statusFilter]);

  const onAssign = useCallback(
    (row: ReturnType<typeof toReplenishmentRow>) => {
      if (!user?.id) return;
      void exec.assign(row.taskId, user.id);
    },
    [exec, user?.id],
  );

  const onStart = useCallback(
    (row: ReturnType<typeof toReplenishmentRow>) => {
      if (!user?.id) return;
      void exec.start(row.taskId, user.id);
    },
    [exec, user?.id],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold text-slate-900">Wykonanie uzupełnień</h1>
        <ReplenishmentFilters
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          onScanRules={() => void runScan()}
          scanning={scanning}
          runtimeAvailable={runtimeAvailable}
        />
      </div>
      {!runtimeAvailable ? (
        <p className="text-xs text-amber-800">
          Runtime wyłączony — tabela statyczna. Klasyczny WMS bez zmian.
        </p>
      ) : null}
      <ReplenishmentTable
        rows={rows}
        loading={loading}
        onAssign={onAssign}
        onStart={onStart}
        onExecute={(row) => exec.open(row)}
        onBlock={(row) => void exec.block(row.taskId)}
        onEscalate={(row) => void exec.escalate(row.taskId, "manual")}
        onOpenStock={(row) => {
          if (row.raw.product_id) navigate(WMS_ROUTES.productPreview(row.raw.product_id));
        }}
      />
      <ReplenishmentExecutionModal
        row={exec.activeRow}
        step={exec.step}
        scanBuffer={exec.scanBuffer}
        busy={exec.busy}
        error={exec.error}
        onScanChange={exec.setScanBuffer}
        onSubmit={() => void exec.submitScan()}
        onComplete={() => void exec.completeDirect()}
        onClose={exec.close}
      />
    </div>
  );
}
