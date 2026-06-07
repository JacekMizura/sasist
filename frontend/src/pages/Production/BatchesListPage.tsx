import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext";
import { listProductionBatches, type ProductionBatchRead } from "../../api/productionApi";
import { BATCH_STATUS_LABEL, batchStatusBadgeClass } from "./productionUi";
import { erpProductionPaths } from "./productionPaths";
import { ProgressBar } from "./components/ProgressBar";

const DEFAULT_TENANT = 1;

type Props = {
  /** When true, omit page title (embedded in Planning page). */
  embedded?: boolean;
};

export default function BatchesListPage({ embedded = false }: Props) {
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

  const content = (
    <>
      {loading ? (
        <p className="text-sm text-slate-500 px-4 lg:px-6">Wczytywanie…</p>
      ) : batches.length === 0 ? (
        <p className="text-sm text-slate-500 px-4 lg:px-6">
          Brak aktywnych partii.{" "}
          <Link to={erpProductionPaths.recipes} className="font-medium text-slate-800 underline">
            Przejdź do receptur
          </Link>
          .
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm mx-4 lg:mx-6">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Partia</th>
                <th className="px-4 py-3">Produkty</th>
                <th className="px-4 py-3">Ilość</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Postęp</th>
                <th className="px-4 py-3">Operator</th>
                <th className="px-4 py-3 text-right">Szczegóły</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono font-medium text-slate-900">{b.number}</td>
                  <td className="px-4 py-3 text-slate-700">{b.products_count ?? b.lines.length}</td>
                  <td className="px-4 py-3 tabular-nums">{b.total_planned_units ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={batchStatusBadgeClass(b.status)}>{BATCH_STATUS_LABEL[b.status]}</span>
                    {b.has_shortages ? (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-amber-800">
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        Braki
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 w-40">
                    <ProgressBar value={b.progress_percent ?? 0} tone={b.has_shortages ? "amber" : "emerald"} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{b.operator_name ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={erpProductionPaths.batch(b.id)}
                      className="text-xs font-medium text-slate-800 underline hover:text-slate-600"
                    >
                      Otwórz
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  if (embedded) return <div className="pb-6">{content}</div>;

  return (
    <div className="px-4 py-6 lg:px-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Partie produkcyjne</h1>
        <p className="text-sm text-slate-500">Fale produkcyjne — wiele produktów, jeden zagregowany pobór surowców.</p>
      </div>
      {content}
    </div>
  );
}
