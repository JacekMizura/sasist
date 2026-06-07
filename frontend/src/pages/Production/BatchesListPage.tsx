import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext";
import { listProductionBatches, type ProductionBatchRead } from "../../api/productionApi";
import { BATCH_STATUS_LABEL, batchStatusBadgeClass } from "./productionUi";
import { ProgressBar } from "./components/ProgressBar";

const DEFAULT_TENANT = 1;

export default function BatchesListPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [batches, setBatches] = useState<ProductionBatchRead[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listProductionBatches(tenantId, { warehouse_id: warehouseId });
      setBatches(rows.filter((b) => b.status !== "completed" && b.status !== "cancelled"));
    } catch {
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="px-4 py-6 lg:px-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Batch produkcyjny</h1>
        <p className="text-sm text-slate-500">Fale produkcyjne — wiele produktów, jeden zagregowany pobór surowców.</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : batches.length === 0 ? (
        <p className="text-sm text-slate-500">
          Brak aktywnych partii.{" "}
          <Link to="/production/recipes" className="text-violet-600 hover:underline">
            Utwórz batch z receptury
          </Link>
          .
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {batches.map((b) => (
            <Link
              key={b.id}
              to={`/production/batches/${b.id}`}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-violet-300 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono font-bold text-slate-900">{b.number}</p>
                <span className={batchStatusBadgeClass(b.status)}>{BATCH_STATUS_LABEL[b.status]}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {b.products_count ?? b.lines.length} produktów · {b.total_planned_units ?? 0} szt.
              </p>
              {b.has_shortages ? (
                <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  Braki składników
                </p>
              ) : null}
              <div className="mt-4">
                <ProgressBar value={b.progress_percent ?? 0} label="Postęp" tone={b.has_shortages ? "amber" : "violet"} />
              </div>
              <p className="mt-3 text-xs text-slate-400">
                {b.operator_name ?? "—"} · {(b.created_at ?? "").slice(0, 10)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
