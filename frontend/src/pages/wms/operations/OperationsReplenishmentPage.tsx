import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ReplenishmentExecutionModal } from "../../../components/operations/replenishment/ReplenishmentExecutionModal";
import { ReplenishmentFilters } from "../../../components/operations/replenishment/ReplenishmentFilters";
import { ReplenishmentTable } from "../../../components/operations/replenishment/ReplenishmentTable";
import { useAuth } from "../../../context/AuthContext";
import { useReplenishmentExecution } from "../../../hooks/replenishment/useReplenishmentExecution";
import { useReplenishmentRealtime } from "../../../hooks/replenishment/useReplenishmentRealtime";
import { orchColumn, toReplenishmentRow } from "../../../utils/replenishmentRowModel";
import { WMS_ROUTES } from "../wmsRoutes";

export default function OperationsReplenishmentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tasks, loading, scanning, runScan, refresh, runtimeAvailable } = useReplenishmentRealtime();
  const [statusFilter, setStatusFilter] = useState("all");
  const exec = useReplenishmentExecution(refresh);

  const rows = useMemo(() => {
    const mapped = tasks.map(toReplenishmentRow);
    if (statusFilter === "open") return mapped.filter((r) => orchColumn(r.raw) !== "COMPLETED");
    if (statusFilter === "active") return mapped.filter((r) => ["ACTIVE", "ASSIGNED"].includes(orchColumn(r.raw)));
    if (statusFilter === "blocked") return mapped.filter((r) => orchColumn(r.raw) === "BLOCKED");
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
    <div className="flex h-full min-h-0 flex-col gap-3 p-2 md:p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Uzupełnienia</h1>
          <p className="text-xs text-slate-500">Przenieś towar ze zaplecza na półki sprzedażowe</p>
        </div>
        <ReplenishmentFilters
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          onScanRules={() => void runScan()}
          scanning={scanning}
          runtimeAvailable={runtimeAvailable}
        />
      </header>
      {!runtimeAvailable ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Tryb podglądu — lista może być niepełna. Klasyczny WMS działa bez zmian.
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
