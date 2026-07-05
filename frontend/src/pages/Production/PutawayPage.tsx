import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { MapPin, PackageCheck } from "lucide-react";

import { parseWmsProductionRouteParams, refKey } from "@/modules/production/productionExecutionTypes";
import { WMS_ROUTES } from "../wms/wmsRoutes";
import { ProductThumb } from "./components/ProductThumb";
import {
  ProductionDocumentsSection,
  putawayStatusLabel,
  putawayStatusBadgeClass,
} from "./components/ProductionDocumentsSection";
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

  const { queue, reloadQueue, putawayDetail, busy, detailLoading, openJob, refreshPutawayDetail } =
    useProductionExecutionJob("putaway", activeRef);

  const pwDocuments =
    putawayDetail?.lines
      .filter((ln) => ln.pwDocumentId != null && ln.pwDocumentId > 0)
      .map((ln) => ({
        id: ln.pwDocumentId!,
        number: ln.pwDocumentNumber,
        putawayStatus: ln.putawayStatus,
        productName: ln.productName,
      })) ?? [];

  const pendingPwCount = pwDocuments.filter((pw) => String(pw.putawayStatus || "").toUpperCase() !== "DONE").length;

  return (
    <div className="w-full space-y-5">
      {!activeRef ? (
        <div className="w-full space-y-4">
          <p className={WMS_TERMINAL_LABEL}>Rozlokowanie wyrobów</p>
          {queue.length === 0 ? (
            <WmsProductionTerminalEmptyState
              title="Brak zadań do rozlokowania"
              description="Po zakończeniu produkcji zlecenia i partie oczekujące na rozlokowanie pojawią się tutaj."
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
            label="Rozlokowanie wyrobów gotowych"
            number={putawayDetail.number}
            productLine={putawayDetail.productLabel}
            accent="emerald"
          />

          {pendingPwCount > 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Pozostało do rozlokowania: <strong>{pendingPwCount}</strong>{" "}
              {pendingPwCount === 1 ? "dokument PW" : "dokumenty PW"}.
            </p>
          ) : pwDocuments.length > 0 ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Wszystkie dokumenty PW zostały rozlokowane.
            </p>
          ) : null}

          <div className="w-full space-y-4">
            {putawayDetail.lines.map((ln) => {
              const done = String(ln.putawayStatus || "").toUpperCase() === "DONE";
              return (
                <div
                  key={ln.lineKey}
                  className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="absolute bottom-0 left-0 top-0 w-1 bg-emerald-400" aria-hidden />
                  <div className="pl-3">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-center gap-4">
                        <ProductThumb name={ln.productName} size="lg" />
                        <div>
                          <p className={WMS_TERMINAL_LABEL}>Produkt</p>
                          <p className="text-xl font-bold text-slate-900">{ln.productName}</p>
                          <p className="mt-1 text-3xl font-black tabular-nums text-slate-900">{ln.quantity}</p>
                        </div>
                      </div>
                      {ln.pwDocumentId ? (
                        <div className="space-y-2 sm:text-right">
                          <p className="font-mono text-sm font-semibold text-slate-800">
                            PW {ln.pwDocumentNumber ?? ln.pwDocumentId}
                          </p>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${putawayStatusBadgeClass(ln.putawayStatus)}`}
                          >
                            {putawayStatusLabel(ln.putawayStatus)}
                          </span>
                          {!done ? (
                            <Link
                              to={WMS_ROUTES.putawayPz(ln.pwDocumentId)}
                              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 sm:w-auto"
                            >
                              <MapPin className="h-4 w-4" aria-hidden />
                              Rozlokuj w WMS
                            </Link>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">Brak dokumentu PW dla tej pozycji.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {pwDocuments.length > 0 ? (
            <ProductionDocumentsSection pwDocuments={pwDocuments} />
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => void refreshPutawayDetail()}
            className="w-full max-w-xl rounded-xl border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Odśwież status rozlokowania
          </button>

          <Link to={wmsProductionPaths.putaway()} className="block text-sm text-slate-500 underline">
            Kolejka rozlokowania
          </Link>
        </>
      ) : (
        <p className="text-sm text-slate-500">Nie udało się wczytać zadania.</p>
      )}
    </div>
  );
}
