import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ClipboardList } from "lucide-react";

import type { CollectionPendingShortageRead, CollectionTaskRead } from "@/api/productionApi";
import {
  isCollectingQueueBlocked,
  parseWmsProductionRouteParams,
  refKey,
} from "@/modules/production/productionExecutionTypes";
import { WmsProductionTerminalEmptyState } from "./WmsProductionTerminalEmptyState";
import { WmsProductionJobQueueCard } from "./components/WmsProductionJobQueueCard";
import { WmsProductionCollectJobHeader } from "./components/WmsProductionCollectJobHeader";
import { WmsProductionCollectTaskCard } from "./components/WmsProductionCollectTaskCard";
import { CollectionShortageModal } from "./components/CollectionShortageModal";
import { WMS_TASK_GRID, WMS_TERMINAL_LABEL } from "../../components/wms/execution/wmsLayoutTokens";
import { START_COLLECTING_BLOCKED_TOOLTIP } from "./productionUi";
import { wmsProductionPaths } from "./productionPaths";
import { useProductionExecutionJob } from "./hooks/useProductionExecutionJob";
import { useWmsProductionSettings } from "./hooks/useWmsProductionSettings";

function isTaskDone(task: CollectionTaskRead): boolean {
  if (task.shortage_reported) return true;
  return task.collected_qty >= task.required_qty - 1e-6;
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
    reportCollectionShortage,
    finishCollecting,
  } = useProductionExecutionJob("collecting", activeRef);

  const [expandedTaskKey, setExpandedTaskKey] = useState<string | null>(null);
  const [dismissedShortageKey, setDismissedShortageKey] = useState<string | null>(null);

  const firstIncompleteKey = useMemo(() => {
    const tasks = collectionState?.tasks ?? [];
    return tasks.find((t) => !isTaskDone(t))?.task_key ?? null;
  }, [collectionState?.tasks]);

  const shortageTask = useMemo(() => {
    const tasks = collectionState?.tasks ?? [];
    return (
      tasks.find(
        (t) =>
          t.pending_shortage != null &&
          !t.shortage_reported &&
          t.task_key !== dismissedShortageKey,
      ) ?? null
    );
  }, [collectionState?.tasks, dismissedShortageKey]);

  const shortage: CollectionPendingShortageRead | null = shortageTask?.pending_shortage ?? null;

  const hasOtherLocation = useMemo(() => {
    if (!shortageTask || !shortage) return false;
    const locId = shortage.location_id ?? 0;
    return (shortageTask.location_options ?? []).some(
      (o) => o.location_id !== locId && Number(o.available_qty) > 1e-9,
    );
  }, [shortageTask, shortage]);

  useEffect(() => {
    setExpandedTaskKey(firstIncompleteKey);
  }, [activeRef?.kind, activeRef?.id, firstIncompleteKey]);

  useEffect(() => {
    // New pending shortage should reopen modal even if previously dismissed.
    if (shortageTask?.pending_shortage) {
      setDismissedShortageKey(null);
    }
  }, [shortageTask?.task_key, shortageTask?.pending_shortage?.missing_qty]);

  return (
    <div className="w-full space-y-5">
      {!activeRef ? (
        <div className="w-full space-y-4">
          <p className={WMS_TERMINAL_LABEL}>Pobieranie komponentów</p>
          {queue.length === 0 ? (
            <WmsProductionTerminalEmptyState
              title="Brak zadań do pobrania"
              description="Gdy zlecenie lub partia wymaga pobrania materiałów, pojawią się tutaj."
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
              const done = isTaskDone(t);
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
                  onConfirm={(locationId, qty, identity) =>
                    void confirmCollectionTask(t.task_key, qty, locationId, identity)
                  }
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

          <CollectionShortageModal
            open={shortage != null && shortageTask != null}
            shortage={shortage}
            unit={(shortageTask?.product_unit ?? "szt.").trim() || "szt."}
            hasOtherLocation={hasOtherLocation}
            onCheckOtherLocation={() => {
              if (shortageTask) {
                setExpandedTaskKey(shortageTask.task_key);
                setDismissedShortageKey(shortageTask.task_key);
              }
            }}
            onReportShortage={() => {
              if (shortageTask) void reportCollectionShortage(shortageTask.task_key);
            }}
            onCancel={() => {
              if (shortageTask) setDismissedShortageKey(shortageTask.task_key);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
