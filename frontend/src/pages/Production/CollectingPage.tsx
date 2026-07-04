import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ClipboardList } from "lucide-react";

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
import { WmsProductionCollectTaskCard } from "./components/WmsProductionCollectTaskCard";
import { WMS_TASK_GRID, WMS_TERMINAL_LABEL } from "../../components/wms/execution/wmsLayoutTokens";
import { START_COLLECTING_BLOCKED_TOOLTIP } from "./productionUi";
import { wmsProductionPaths } from "./productionPaths";
import { useProductionExecutionJob } from "./hooks/useProductionExecutionJob";
import { useWmsProductionSettings } from "./hooks/useWmsProductionSettings";

export default function CollectingPage() {
  const { kind, id, batchId } = useParams();
  const activeRef = useMemo(
    () => parseWmsProductionRouteParams({ kind, id, batchId }),
    [kind, id, batchId],
  );
  const { display } = useWmsProductionSettings();

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
          <p className={WMS_TERMINAL_LABEL}>Kolejka — pobieranie półproduktów</p>
          {queue.length === 0 ? (
            <WmsProductionTerminalEmptyState
              title="Brak zadań do pobrania"
              description="Gdy partia lub zlecenie przejdzie do etapu zbierania, zadania pobrania z lokalizacji pojawią się tutaj."
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
                label={`Pobrano ${collectionState.collectedCount} / ${collectionState.totalCount}`}
                tone="amber"
              />
            </div>
          ) : null}

          <div className="w-full space-y-4">
            {(collectionState?.tasks ?? []).map((t) => {
              const done = t.collected_qty >= t.required_qty - 1e-6;
              return (
                <WmsProductionCollectTaskCard
                  key={t.task_key}
                  task={t}
                  display={display}
                  done={done}
                  busy={busy}
                  onConfirm={() => void confirmCollectionTask(t.task_key, t.required_qty)}
                />
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
              Zakończ pobieranie → produkcja
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
