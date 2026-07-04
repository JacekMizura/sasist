import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { MapPin, PackageCheck } from "lucide-react";

import { parseWmsProductionRouteParams, refKey } from "@/modules/production/productionExecutionTypes";
import { ProductThumb } from "./components/ProductThumb";
import { ProductionWarehouseLocationSearch } from "./ProductionWarehouseLocationSearch";
import { loadRecentTargetLocations } from "./productionUi";
import { WmsProductionTerminalEmptyState } from "./WmsProductionTerminalEmptyState";
import { WmsProductionJobQueueCard } from "./components/WmsProductionJobQueueCard";
import { WmsProductionActiveBatchBar } from "./components/WmsProductionActiveBatchBar";
import { WMS_TASK_GRID, WMS_TERMINAL_LABEL } from "../../components/wms/execution/wmsLayoutTokens";
import { wmsProductionPaths } from "./productionPaths";
import { useProductionExecutionJob } from "./hooks/useProductionExecutionJob";

export default function PutawayPage() {
  const { kind, id, batchId } = useParams();
  const activeRef = useMemo(
    () => parseWmsProductionRouteParams({ kind, id, batchId }),
    [kind, id, batchId],
  );

  const {
    tenantId,
    queue,
    reloadQueue,
    putawayDetail,
    putawayTargets,
    busy,
    detailLoading,
    openJob,
    setPutawayTarget,
    finishPutaway,
  } = useProductionExecutionJob("putaway", activeRef);

  const recentIds = putawayDetail ? loadRecentTargetLocations(putawayDetail.warehouseId) : [];

  return (
    <div className="w-full space-y-5">
      {!activeRef ? (
        <div className="w-full space-y-4">
          <p className={WMS_TERMINAL_LABEL}>Odkładanie wyrobów</p>
          {queue.length === 0 ? (
            <WmsProductionTerminalEmptyState
              title="Brak zadań do odłożenia"
              description="Po zakończeniu produkcji zlecenia i partie oczekujące na odkładanie pojawią się tutaj."
              icon={<PackageCheck size={22} strokeWidth={2} />}
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
                  quantity={job.completed_quantity || job.planned_quantity}
                  status={job.status}
                  accent="emerald"
                  onClick={() => void openJob(job)}
                />
              ))}
            </div>
          )}
        </div>
      ) : detailLoading && !putawayDetail ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : putawayDetail ? (
        <>
          <WmsProductionActiveBatchBar
            kind={activeRef.kind}
            label="Odkładanie wyrobów gotowych"
            number={putawayDetail.number}
            accent="emerald"
          />

          <div className="w-full space-y-4">
            {putawayDetail.lines.map((ln) => {
              const target = putawayTargets[ln.lineKey];
              return (
                <div
                  key={ln.lineKey}
                  className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="absolute bottom-0 left-0 top-0 w-1 bg-emerald-400" aria-hidden />
                  <div className="pl-3">
                    <div className="flex items-center gap-4">
                      <ProductThumb name={ln.productName} size="lg" />
                      <div>
                        <p className={WMS_TERMINAL_LABEL}>Produkt</p>
                        <p className="text-xl font-bold text-slate-900">{ln.productName}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className={WMS_TERMINAL_LABEL}>Ilość</p>
                        <p className="mt-1 text-3xl font-black tabular-nums text-slate-900">{ln.quantity}</p>
                      </div>
                      <div>
                        <p className="mb-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                          <MapPin className="h-3.5 w-3.5" aria-hidden />
                          Lokacja docelowa
                        </p>
                        <ProductionWarehouseLocationSearch
                          tenantId={tenantId}
                          warehouseId={putawayDetail.warehouseId}
                          value={target?.id ?? null}
                          valueLabel={target?.code ?? null}
                          recentLocationIds={recentIds}
                          onChange={(locId, code) => setPutawayTarget(ln.lineKey, locId, code)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void finishPutaway()}
            className="w-full max-w-xl rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Potwierdź odkładanie
          </button>

          <Link
            to={wmsProductionPaths.execute(activeRef.kind, activeRef.id)}
            className="block text-sm text-slate-500 underline"
          >
            Wróć do produkcji
          </Link>
        </>
      ) : (
        <p className="text-sm text-slate-500">Nie udało się wczytać zadania.</p>
      )}
    </div>
  );
}
