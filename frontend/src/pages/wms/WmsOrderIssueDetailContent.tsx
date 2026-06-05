import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  postWmsOrderIssueTaskArchive,
  type OrderIssueDetailLineApi,
  type OrderIssueOrderContextApi,
  type OrderIssueTaskListItemApi,
} from "../../api/wmsOrderIssueTasksApi";
import { RelocationBatchChoiceModal } from "../../components/wms/relocation/RelocationBatchChoiceModal";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { brakiPrimaryCta, parseBrakiWorkflowStatus } from "./brakiWorkflowCta";
import { WMS_ROUTES, dispatchWmsShortagesUpdated } from "./wmsRoutes";
import { IssueDetailSection } from "./WmsOrderIssueDetailPage";

function emptyContext(ctx: OrderIssueOrderContextApi | undefined): OrderIssueOrderContextApi {
  return ctx ?? { collected_lines: [], shortage_decision_lines: [], remaining_pick_lines: [] };
}

function shortageLineToDetailLine(
  sl: {
    missing_qty: number;
    remaining_qty?: number;
    order_item_id?: number;
    product_id?: number;
    product_name?: string | null;
    sku?: string | null;
    ean?: string | null;
    nearest_location_code?: string | null;
    location_code?: string | null;
    image_url?: string | null;
    picked_qty?: number;
    ordered_qty?: number;
    pick_audit_summary?: string | null;
    badge_label?: string | null;
  },
  workflowStatus: string,
): OrderIssueDetailLineApi {
  const awaitingOms = workflowStatus === "awaiting";
  const badge =
    (sl.badge_label ?? "").trim() ||
    (awaitingOms ? "Brak do decyzji OMS" : "Do zebrania");
  return {
    ...sl,
    line_kind: awaitingOms ? "shortage_unresolved" : "remaining",
    badge_label: badge,
    remaining_qty: sl.remaining_qty ?? sl.missing_qty,
    sku: sl.sku ?? "",
    ean: sl.ean ?? "",
  } as OrderIssueDetailLineApi;
}

function brakiQueueBucketLabel(bucket: string | undefined, workflowStatus: string): string {
  const b = (bucket ?? "").trim();
  if (b === "ready_pack") return "Gotowe do pakowania";
  if (b === "waiting_customer") return "Oczekuje na klienta";
  if (b === "recovery_ready") return "Możliwa dogrywka / zbieranie";
  if (b === "awaiting_oms" || workflowStatus === "awaiting") return "Oczekuje na decyzję OMS";
  return "Braki w realizacji";
}

export type WmsOrderIssueDetailContentProps = {
  task: OrderIssueTaskListItemApi;
  warehouseId: number;
  onReload: () => void;
  onArchiveError: (message: string) => void;
};

/** Widok szczegółów braków — montowany tylko gdy `task` jest załadowany (stabilne drzewo hooków). */
export function WmsOrderIssueDetailContent({
  task,
  warehouseId,
  onReload,
  onArchiveError,
}: WmsOrderIssueDetailContentProps) {
  const navigate = useNavigate();
  const [archivePending, setArchivePending] = useState(false);
  const [relocationModalOpen, setRelocationModalOpen] = useState(false);
  const [relocationToast, setRelocationToast] = useState<string | null>(null);

  const ctx = emptyContext(task.order_context);
  const workflowStatus = parseBrakiWorkflowStatus(task);
  const shortageAsDetail = (task.shortage_lines ?? [])
    .filter((l) => l.missing_qty > 1e-9)
    .map((l) => shortageLineToDetailLine(l, workflowStatus));
  const remainingLines = (ctx.remaining_pick_lines ?? []).filter(
    (l) => (l.remaining_qty ?? l.missing_qty ?? 0) > 1e-9,
  );
  const collectedLines = ctx.collected_lines ?? [];
  const hasActiveShortageLines = shortageAsDetail.length > 0 || remainingLines.length > 0;
  const readyForPacking = workflowStatus === "ready_pack";
  const primaryCta = brakiPrimaryCta(task, navigate, {
    warehouseId,
    onPackingError: (msg) => setRelocationToast(msg),
  });
  const needsRelocationChoice =
    workflowStatus === "relocation" || workflowStatus === "relocation_partial";
  const workflowLabel = (task.braki_workflow_status_label ?? "").trim();
  const statusHeadline =
    workflowStatus === "awaiting"
      ? workflowLabel || "Oczekuje na decyzję OMS"
      : (task.issue_queue_summary_line ?? "").trim() || workflowLabel || "—";
  const showOmsLink = workflowStatus !== "awaiting";
  const canArchive = readyForPacking && !hasActiveShortageLines;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log("render shortages detail", {
      taskId: task.id,
      orderId: task.order_id,
      shortageStatus: workflowStatus,
      relocationRequired: needsRelocationChoice,
      archived: task.status === "archived" || task.braki_queue_bucket === "archived",
      pickedQty: collectedLines.reduce((s, l) => s + (Number(l.picked_qty) || 0), 0),
      hasActiveShortageLines,
      canArchive,
    });
  }, [
    task.id,
    task.order_id,
    task.status,
    task.braki_queue_bucket,
    workflowStatus,
    needsRelocationChoice,
    collectedLines,
    hasActiveShortageLines,
    canArchive,
  ]);

  const onArchiveShortage = useCallback(async () => {
    if (!canArchive) return;
    setArchivePending(true);
    try {
      await postWmsOrderIssueTaskArchive(DAMAGE_TENANT_ID, warehouseId, task.id);
      navigate(WMS_ROUTES.braki(), { replace: true });
    } catch {
      onArchiveError("Nie udało się zamknąć braku w kolejce.");
    } finally {
      setArchivePending(false);
    }
  }, [canArchive, navigate, onArchiveError, task.id, warehouseId]);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 antialiased">
      <div className="relative mx-auto flex h-full w-full max-w-4xl flex-col bg-white shadow-xl">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-slate-200 bg-white px-2 md:h-16 md:px-4">
          <Link
            to={WMS_ROUTES.braki()}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 active:bg-slate-200"
          >
            <i className="fa-solid fa-arrow-left"></i>
            <span>Kolejka braków</span>
          </Link>
          <div className="ml-auto hidden items-center gap-3 pr-2 md:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
              <i className="fa-solid fa-user"></i>
            </div>
          </div>
        </header>

        <main className="custom-scrollbar flex-1 overflow-y-auto pb-36 md:pb-40">
          <div className="p-4 pb-2 md:p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Zamówienie
                </div>
                <h1 className="font-mono text-3xl font-black tracking-tight text-slate-900">
                  {task.order_number}
                </h1>
              </div>
              <div className="hidden rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm md:block">
                {brakiQueueBucketLabel(task.braki_queue_bucket, workflowStatus)}
              </div>
            </div>

            <div className="space-y-1.5 text-sm md:text-base">
              <div className="flex flex-col gap-1 sm:flex-row sm:gap-2">
                <span className="font-medium text-slate-500 shrink-0">Klient:</span>
                <span className="font-semibold text-slate-800">
                  {(task.customer_name ?? "").trim() || (task.delivery_name ?? "").trim() || "—"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-500">Status:</span>
                <span className="font-bold text-slate-800">BRAKI</span>
                <span className="mx-1 text-slate-400">•</span>
                <span className="text-slate-600">{statusHeadline || "—"}</span>
              </div>

              {task.issue_queue_summary_line ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 md:text-sm">
                  <i className="fa-solid fa-circle-exclamation text-slate-400"></i>
                  <span>{task.issue_queue_summary_line}</span>
                </div>
              ) : null}
            </div>
          </div>

          {relocationToast ? (
            <div className="mx-4 mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 md:mx-6">
              {relocationToast}
            </div>
          ) : null}

          {readyForPacking && !hasActiveShortageLines ? (
            <div className="mx-4 mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-5 text-center md:mx-6">
              <p className="text-sm font-bold text-blue-900">Zamówienie gotowe do pakowania</p>
              <p className="mt-1 text-xs text-blue-700">
                Wszystkie braki zostały rozliczone — możesz przejść do pakowania.
              </p>
            </div>
          ) : null}

          {collectedLines.length === 0 && !hasActiveShortageLines && !readyForPacking ? (
            <div className="m-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500 md:m-6">
              Brak pozycji na zamówieniu.
            </div>
          ) : (
            <>
              <IssueDetailSection title="Produkty zebrane" lines={collectedLines} variant="collected" />
              {hasActiveShortageLines ? (
                <IssueDetailSection
                  title={
                    workflowStatus === "awaiting" ? "Braki do decyzji OMS" : "Produkty do zebrania"
                  }
                  lines={remainingLines.length > 0 ? remainingLines : shortageAsDetail}
                  variant="remaining"
                />
              ) : null}
            </>
          )}
        </main>

        <div className="absolute bottom-0 left-0 z-30 w-full border-t border-slate-200 bg-white p-4 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)] md:p-6">
          <div className="flex w-full flex-col gap-3 sm:flex-row-reverse">
            <button
              type="button"
              onClick={() => {
                if (needsRelocationChoice) {
                  setRelocationModalOpen(true);
                } else {
                  void Promise.resolve(primaryCta.navigate());
                }
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 active:scale-[0.98] sm:flex-1 md:text-base"
            >
              {needsRelocationChoice ? "Rozlokuj produkty" : primaryCta.label}
            </button>
            {canArchive ? (
              <button
                type="button"
                disabled={archivePending}
                onClick={() => void onArchiveShortage()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 py-3.5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-100 disabled:opacity-60 sm:flex-1 md:text-base"
              >
                {archivePending ? "Zamykanie…" : "Zamknij brak"}
              </button>
            ) : null}
            {showOmsLink ? (
              <Link
                to={`/orders/${task.order_id}`}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white py-3.5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100 active:scale-[0.98] active:bg-slate-100 sm:flex-1 md:text-base"
              >
                Otwórz zamówienie OMS
              </Link>
            ) : null}
          </div>
          <div className="mx-auto mt-2 h-1 w-1/3 rounded-full bg-slate-300 opacity-0"></div>
        </div>
      </div>

      {needsRelocationChoice ? (
        <RelocationBatchChoiceModal
          open={relocationModalOpen}
          tenantId={DAMAGE_TENANT_ID}
          warehouseId={warehouseId}
          orderId={task.order_id}
          onClose={() => setRelocationModalOpen(false)}
          onAddOnly={({ document_label, lines_added }) => {
            setRelocationToast(
              `Dodano ${lines_added} poz. do dokumentu ${document_label}. Możesz kontynuować pracę tutaj.`,
            );
            dispatchWmsShortagesUpdated();
            onReload();
          }}
          onAddAndGo={({ task_id }) => {
            navigate(WMS_ROUTES.operationalRelocationTask(task_id), {
              state: { startRelocationSession: true },
            });
          }}
        />
      ) : null}
    </div>
  );
}
