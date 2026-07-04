import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, Check, ClipboardList, MapPin, ScanLine } from "lucide-react";

import {
  EXECUTION_STATUS_LABEL,
  isCollectingQueueBlocked,
  parseWmsProductionRouteParams,
  refKey,
} from "@/modules/production/productionExecutionTypes";
import { ProgressBar } from "./components/ProgressBar";
import { WmsProductionTerminalEmptyState } from "./WmsProductionTerminalEmptyState";
import { WmsProductionJobQueueCard } from "./components/WmsProductionJobQueueCard";
import { WmsProductionActiveBatchBar } from "./components/WmsProductionActiveBatchBar";
import { WMS_TASK_GRID, WMS_TERMINAL_LABEL } from "../../components/wms/execution/wmsLayoutTokens";
import { START_COLLECTING_BLOCKED_TOOLTIP } from "./productionUi";
import { wmsProductionPaths } from "./productionPaths";
import { useProductionExecutionJob } from "./hooks/useProductionExecutionJob";

export default function CollectingPage() {
  const { kind, id, batchId } = useParams();
  const activeRef = useMemo(
    () => parseWmsProductionRouteParams({ kind, id, batchId }),
    [kind, id, batchId],
  );

  const {
    queue,
    reloadQueue,
    collectionState,
    busy,
    detailLoading,
    openJob,
    confirmCollectionTask,
    finishCollecting,
  } = useProductionExecutionJob("collecting", activeRef);

  const activeJob = activeRef
    ? queue.find((j) => j.kind === activeRef.kind && j.id === activeRef.id)
    : null;

  const headerLabel = collectionState
    ? EXECUTION_STATUS_LABEL[collectionState.status] ?? collectionState.status
    : "Zbieranie surowców";

  return (
    <div className="w-full space-y-5">
      {!activeRef ? (
        <div className="w-full space-y-4">
          <p className={WMS_TERMINAL_LABEL}>Kolejka zbierania</p>
          {queue.length === 0 ? (
            <WmsProductionTerminalEmptyState
              title="Brak zadań do zbierania"
              description="Gdy zlecenie lub partia przejdzie do etapu zbierania surowców, pojawi się tutaj."
              icon={<ClipboardList size={22} strokeWidth={2} />}
              onRefresh={() => void reloadQueue()}
            />
          ) : (
            <div className={WMS_TASK_GRID}>
              {queue.map((job) => {
                const blocked = isCollectingQueueBlocked(job);
                return (
                  <WmsProductionJobQueueCard
                    key={refKey({ kind: job.kind, id: job.id })}
                    kind={job.kind}
                    number={job.number}
                    productLine={job.product_label}
                    quantity={job.planned_quantity}
                    status={job.status}
                    accent="amber"
                    disabled={blocked}
                    disabledTitle={blocked ? START_COLLECTING_BLOCKED_TOOLTIP : undefined}
                    statusBadge={
                      blocked ? (
                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-900">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                          Braki materiałów
                        </span>
                      ) : null
                    }
                    onClick={() => void openJob(job)}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : detailLoading && !collectionState ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : (
        <>
          <WmsProductionActiveBatchBar
            kind={activeRef.kind}
            label={headerLabel}
            number={activeJob?.number ?? `#${activeRef.id}`}
            productLine={activeJob?.product_label}
            quantity={activeJob?.planned_quantity}
            accent="amber"
          />

          {collectionState ? (
            <div className="w-full rounded-xl border border-slate-200 bg-white p-4">
              <ProgressBar
                value={collectionState.collectedCount}
                max={collectionState.totalCount || 1}
                label={`Zebrano ${collectionState.collectedCount} / ${collectionState.totalCount}`}
                tone="amber"
              />
            </div>
          ) : null}

          <div className="w-full space-y-4">
            {(collectionState?.tasks ?? []).map((t) => {
              const done = t.collected_qty >= t.required_qty - 1e-6;
              return (
                <div
                  key={t.task_key}
                  className={`relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm ${
                    done ? "border-emerald-200" : "border-slate-200"
                  }`}
                >
                  <div
                    className={`absolute bottom-0 left-0 top-0 w-1 ${done ? "bg-emerald-400" : "bg-amber-400"}`}
                    aria-hidden
                  />
                  <div className="pl-3">
                    <p className={WMS_TERMINAL_LABEL}>Lokalizacja</p>
                    <p className="mt-1 inline-flex items-center gap-2 font-mono text-2xl font-black text-slate-900">
                      <MapPin className="h-6 w-6 text-amber-600" aria-hidden />
                      {t.location_code}
                    </p>
                    <p className="mt-3 text-lg font-bold text-slate-900">{t.product_name}</p>
                    <p className="mt-1 text-3xl font-black tabular-nums text-slate-900">
                      {t.required_qty}
                      <span className="ml-1 text-sm font-semibold text-slate-500">szt.</span>
                    </p>
                    {!done ? (
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void confirmCollectionTask(t.task_key, t.required_qty)}
                          className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-base font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check className="h-5 w-5" aria-hidden />
                          Potwierdź
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void confirmCollectionTask(t.task_key, t.required_qty)}
                          className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 py-3 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        >
                          <ScanLine className="h-4 w-4" aria-hidden />
                          Skanuj
                        </button>
                      </div>
                    ) : (
                      <p className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-700">
                        <Check className="h-4 w-4" aria-hidden />
                        Zebrane
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {collectionState &&
          collectionState.collectedCount >= collectionState.totalCount &&
          collectionState.totalCount > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void finishCollecting()}
              className="w-full max-w-xl rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Zakończ zbieranie →
            </button>
          ) : null}

          <Link to={wmsProductionPaths.collecting()} className="block text-sm font-medium text-slate-500 underline">
            Wróć do kolejki
          </Link>
        </>
      )}
    </div>
  );
}
