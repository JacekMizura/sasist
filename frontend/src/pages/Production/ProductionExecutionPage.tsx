import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Factory } from "lucide-react";

import { parseWmsProductionRouteParams, refKey } from "@/modules/production/productionExecutionTypes";
import { ProductThumb } from "./components/ProductThumb";
import { ProgressBar } from "./components/ProgressBar";
import { WmsProductionTerminalEmptyState } from "./WmsProductionTerminalEmptyState";
import { WmsProductionJobQueueCard } from "./components/WmsProductionJobQueueCard";
import { WmsProductionActiveBatchBar } from "./components/WmsProductionActiveBatchBar";
import { WMS_TASK_GRID, WMS_TERMINAL_LABEL } from "../../components/wms/execution/wmsLayoutTokens";
import { wmsProductionPaths } from "./productionPaths";
import { useProductionExecutionJob } from "./hooks/useProductionExecutionJob";
import { useWmsProductionSettings } from "./hooks/useWmsProductionSettings";

export default function ProductionExecutionPage() {
  const { kind, id, batchId } = useParams();
  const activeRef = useMemo(
    () => parseWmsProductionRouteParams({ kind, id, batchId }),
    [kind, id, batchId],
  );
  const { display } = useWmsProductionSettings();

  const {
    queue,
    reloadQueue,
    executionDetail,
    busy,
    detailLoading,
    openJob,
    addProductionQty,
    finishProduction,
  } = useProductionExecutionJob("execute", activeRef);

  const allDone = executionDetail?.lines.every(
    (ln) => ln.completedQuantity >= ln.plannedQuantity - 1e-6,
  );

  return (
    <div className="w-full space-y-5">
      {!activeRef ? (
        <div className="w-full space-y-4">
          <p className={WMS_TERMINAL_LABEL}>W produkcji</p>
          {queue.length === 0 ? (
            <WmsProductionTerminalEmptyState
              title="Brak zadań w produkcji"
              description="Zlecenia i partie w realizacji pojawią się tutaj do rejestracji postępu."
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
                  accent="blue"
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
            accent="blue"
          />

          <div className="w-full space-y-4">
            {executionDetail.lines.map((ln) => {
              const remaining = Math.max(0, ln.plannedQuantity - ln.completedQuantity);
              return (
                <div
                  key={ln.lineKey}
                  className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="absolute bottom-0 left-0 top-0 w-1 bg-blue-400" aria-hidden />
                  <div className="pl-3">
                    <div className="flex items-center gap-4">
                      <ProductThumb imageUrl={ln.productImageUrl} name={ln.productName} size="lg" />
                      <div>
                        {display.show_name ? (
                          <p className="text-xl font-bold text-slate-900">{ln.productName}</p>
                        ) : null}
                        {display.show_sku && ln.productSku ? (
                          <p className="mt-1 font-mono text-sm text-slate-500">{ln.productSku}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4">
                      <p className={WMS_TERMINAL_LABEL}>Postęp</p>
                      <p className="mt-1 text-4xl font-black tabular-nums text-slate-900">
                        {ln.completedQuantity}
                        <span className="text-xl font-bold text-slate-400"> / {ln.plannedQuantity}</span>
                      </p>
                      <div className="mt-3">
                        <ProgressBar
                          value={ln.completedQuantity}
                          max={ln.plannedQuantity || 1}
                          tone="emerald"
                        />
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        disabled={busy || remaining <= 0}
                        onClick={() => void addProductionQty(ln.lineKey, 1)}
                        className="rounded-xl bg-slate-900 py-4 text-xl font-black text-white hover:bg-slate-800 disabled:opacity-40"
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        disabled={busy || remaining <= 0}
                        onClick={() => void addProductionQty(ln.lineKey, 5)}
                        className="rounded-xl bg-slate-700 py-4 text-xl font-black text-white hover:bg-slate-600 disabled:opacity-40"
                      >
                        +5
                      </button>
                      <button
                        type="button"
                        disabled={busy || remaining <= 0}
                        onClick={() => void addProductionQty(ln.lineKey, remaining)}
                        className="rounded-xl border border-emerald-300 bg-emerald-50 py-3 text-sm font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-40"
                      >
                        Zakończ krok
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {allDone ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void finishProduction()}
              className="w-full max-w-xl rounded-xl bg-blue-600 py-4 text-lg font-bold text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Zakończ produkcję → rozlokowanie (PW)
            </button>
          ) : null}

          <Link to={wmsProductionPaths.collecting()} className="block text-sm text-slate-500 underline">
            Kolejka zbierania
          </Link>
        </>
      ) : (
        <p className="text-sm text-slate-500">Nie udało się wczytać zadania.</p>
      )}
    </div>
  );
}
