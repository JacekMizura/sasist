import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ClipboardList } from "lucide-react";

import {
  isCollectingQueueBlocked,
  parseWmsProductionRouteParams,
  refKey,
} from "@/modules/production/productionExecutionTypes";
import { WmsProductionTerminalEmptyState } from "./WmsProductionTerminalEmptyState";
import { WmsProductionJobQueueCard } from "./components/WmsProductionJobQueueCard";
import { WmsProductionCollectJobHeader } from "./components/WmsProductionCollectJobHeader";
import { WmsProductionCollectTaskCard } from "./components/WmsProductionCollectTaskCard";
import { WMS_TASK_GRID, WMS_TERMINAL_LABEL } from "../../components/wms/execution/wmsLayoutTokens";
import { START_COLLECTING_BLOCKED_TOOLTIP } from "./productionUi";
import { wmsProductionPaths } from "./productionPaths";
import { useProductionExecutionJob } from "./hooks/useProductionExecutionJob";
import { useWmsProductionSettings } from "./hooks/useWmsProductionSettings";

function isTaskDone(required: number, collected: number): boolean {
  return collected >= required - 1e-6;
}

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

  const [expandedTaskKey, setExpandedTaskKey] = useState<string | null>(null);

  const firstIncompleteKey = useMemo(() => {
    const tasks = collectionState?.tasks ?? [];
    return tasks.find((t) => !isTaskDone(t.required_qty, t.collected_qty))?.task_key ?? null;
  }, [collectionState?.tasks]);

  useEffect(() => {
    setExpandedTaskKey(firstIncompleteKey);
  }, [activeRef?.kind, activeRef?.id, firstIncompleteKey]);

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
                    productImageUrl={job.product_image_url}
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
      ) : collectionState ? (
        <>
          <WmsProductionCollectJobHeader
            kind={activeRef.kind}
            header={collectionState.header}
            collectedCount={collectionState.collectedCount}
            totalCount={collectionState.totalCount}
          />

          <div className="w-full space-y-3">
            {collectionState.tasks.map((t, idx) => {
              const done = isTaskDone(t.required_qty, t.collected_qty);
              const expanded = expandedTaskKey === t.task_key;
              return (
                <WmsProductionCollectTaskCard
                  key={t.task_key}
                  index={idx + 1}
                  task={t}
                  display={display}
                  expanded={expanded}
                  done={done}
                  busy={busy}
                  onToggle={() => setExpandedTaskKey(t.task_key)}
                  onConfirm={(locationId, qty) => void confirmCollectionTask(t.task_key, qty, locationId)}
                />
              );
            })}
          </div>

          {collectionState.collectedCount >= collectionState.totalCount && collectionState.totalCount > 0 ? (
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
      ) : null}
    </div>
  );
}
