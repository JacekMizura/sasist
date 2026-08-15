import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Factory } from "lucide-react";

import { parseWmsProductionRouteParams, refKey } from "@/modules/production/productionExecutionTypes";
import { WmsProductionTerminalEmptyState } from "./WmsProductionTerminalEmptyState";
import { WmsProductionJobQueueCard } from "./components/WmsProductionJobQueueCard";
import { WmsProductionActiveBatchBar } from "./components/WmsProductionActiveBatchBar";
import { WmsProductionExecuteTaskCard } from "./components/WmsProductionExecuteTaskCard";
import { WMS_TASK_GRID, WMS_TERMINAL_LABEL } from "../../components/wms/execution/wmsLayoutTokens";
import { wmsProductionPaths } from "./productionPaths";
import { useProductionExecutionJob } from "./hooks/useProductionExecutionJob";
import { useWmsProductionSettings } from "./hooks/useWmsProductionSettings";

function isLineDone(planned: number, completed: number): boolean {
  return completed >= planned - 1e-6;
}

export default function ProductionExecutionPage() {
  const { kind, id, batchId } = useParams();
  const activeRef = useMemo(
    () => parseWmsProductionRouteParams({ kind, id, batchId }),
    [kind, id, batchId],
  );
  const { display, traceability } = useWmsProductionSettings();

  const {
    queue,
    reloadQueue,
    executionDetail,
    busy,
    detailLoading,
    openJob,
    registerProductionQty,
  } = useProductionExecutionJob("execute", activeRef);

  const [expandedLineKey, setExpandedLineKey] = useState<string | null>(null);

  const firstIncompleteKey = useMemo(() => {
    const lines = executionDetail?.lines ?? [];
    return lines.find((ln) => !isLineDone(ln.plannedQuantity, ln.completedQuantity))?.lineKey ?? null;
  }, [executionDetail?.lines]);

  useEffect(() => {
    setExpandedLineKey(firstIncompleteKey);
  }, [activeRef?.kind, activeRef?.id, firstIncompleteKey]);

  return (
    <div className="w-full space-y-5">
      {!activeRef ? (
        <div className="w-full space-y-4">
          <p className={WMS_TERMINAL_LABEL}>Produkcja</p>
          {queue.length === 0 ? (
            <WmsProductionTerminalEmptyState
              title="Brak zadań w produkcji"
              description="Po zakończeniu pobierania komponentów zlecenia pojawią się tutaj do rejestracji produkcji."
              icon={<Factory size={22} strokeWidth={2} />}
              onRefresh={() => void reloadQueue()}
            />
          ) : (
            <div className={WMS_TASK_GRID}>
              {queue.map((job) => (
                <WmsProductionJobQueueCard
                  key={refKey({ kind: job.kind, id: job.id })}
                  kind={job.kind}
                  number={job.number}
                  productLine={job.product_label}
                  productImageUrl={job.product_image_url}
                  quantity={job.planned_quantity}
                  status={job.status}
                  accent="amber"
                  onClick={() => void openJob(job)}
                />
              ))}
            </div>
          )}
        </div>
      ) : detailLoading && !executionDetail ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : executionDetail ? (
        <>
          <WmsProductionActiveBatchBar
            kind={activeRef.kind}
            label="Produkcja"
            number={executionDetail.number}
            productLine={executionDetail.productLabel}
            productImageUrl={executionDetail.lines[0]?.productImageUrl}
            accent="amber"
          />

          <div className="w-full space-y-3">
            {executionDetail.lines.map((ln, idx) => {
              const done = isLineDone(ln.plannedQuantity, ln.completedQuantity);
              const expanded = expandedLineKey === ln.lineKey;
              return (
                <WmsProductionExecuteTaskCard
                  key={ln.lineKey}
                  index={idx + 1}
                  line={ln}
                  display={display}
                  traceability={traceability}
                  expanded={expanded}
                  done={done}
                  busy={busy}
                  onToggle={() => setExpandedLineKey((k) => (k === ln.lineKey ? null : ln.lineKey))}
                  onRegister={(qty, identity) => void registerProductionQty(ln.lineKey, qty, identity)}
                />
              );
            })}
          </div>

          <Link to={wmsProductionPaths.collecting()} className="block text-sm text-slate-500 underline">
            Kolejka pobierania komponentów
          </Link>
        </>
      ) : (
        <p className="text-sm text-slate-500">Nie udało się wczytać zadania.</p>
      )}
    </div>
  );
}
