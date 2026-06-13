import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Layers, Loader2 } from "lucide-react";

import {
  fetchConsolidationStagingQueue,
  postStartConsolidationStaging,
  consolidationStagingErrorMessage,
  type ConsolidationStagingQueueRow,
} from "../../../api/wmsConsolidationApi";
import { useWarehouse } from "../../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { WMS_ROUTES } from "../wmsRoutes";
import { consolidationPlanStatusClass, consolidationPlanStatusLabel } from "./consolidationStatusUi";
import {
  ConsolidationOperatorPage,
  OperatorPrimaryButton,
  WMS_CONSOLIDATION_LABELS,
} from "./consolidationOperatorUi";

export default function ConsolidationStagingPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [rows, setRows] = useState<ConsolidationStagingQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPlanId, setBusyPlanId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (warehouseId == null || warehouseId <= 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConsolidationStagingQueue(DAMAGE_TENANT_ID, warehouseId);
      setRows(data);
    } catch {
      setRows([]);
      setError("Nie udało się wczytać kolejki rozkładania.");
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStart = async (planId: number) => {
    if (warehouseId == null) return;
    setBusyPlanId(planId);
    setError(null);
    try {
      await postStartConsolidationStaging(planId, DAMAGE_TENANT_ID);
      await load();
    } catch (e: unknown) {
      setError(consolidationStagingErrorMessage(e, "Nie udało się rozpocząć rozkładania."));
    } finally {
      setBusyPlanId(null);
    }
  };

  return (
    <ConsolidationOperatorPage
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Rozkładanie na półki</h1>
            <p className="text-sm text-slate-600">
              Przypisz zamówienie do półki i rozpocznij odkładanie
              {warehouse?.name ? ` · ${warehouse.name}` : ""}
            </p>
          </div>
          <Link
            to={WMS_ROUTES.consolidations}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {WMS_CONSOLIDATION_LABELS.backToTodo}
          </Link>
        </div>
      }
    >

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Wczytywanie…
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center">
          <Layers className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-600">Brak zamówień do rozkładania.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Zamówienie</th>
                <th className="px-4 py-3">Transfery</th>
                <th className="px-4 py-3">Półka</th>
                <th className="px-4 py-3">Postęp</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Akcja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <Link
                      to={WMS_ROUTES.consolidationDetail(row.id)}
                      className="font-medium text-sky-700 hover:underline"
                    >
                      {row.order_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.progress_label}</td>
                  <td className="px-4 py-3 font-mono text-slate-800">{row.shelf_label ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.staging_label}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${consolidationPlanStatusClass(row.status)}`}
                    >
                      {consolidationPlanStatusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.can_start_staging ? (
                      <OperatorPrimaryButton
                        disabled={busyPlanId === row.id}
                        onClick={() => void handleStart(row.id)}
                      >
                        {busyPlanId === row.id ? "Start…" : "Rozpocznij rozkładanie"}
                      </OperatorPrimaryButton>
                    ) : row.status === "STAGING" ? (
                      <Link
                        to={WMS_ROUTES.consolidationDetail(row.id)}
                        className="text-xs font-medium text-sky-700 hover:underline"
                      >
                        Odkładaj pozycje
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-500">Oczekiwanie</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ConsolidationOperatorPage>
  );
}
