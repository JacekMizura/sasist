import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  postWmsOrderIssueTaskArchive,
  type OrderIssueDetailLineApi,
  type OrderIssueOrderContextApi,
  type OrderIssueTaskListItemApi,
} from "../../api/wmsOrderIssueTasksApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import {
  brakiPrimaryAction,
  resolveShortageLifecyclePhase,
  shortageLifecycleHeadline,
} from "./brakiWorkflowCta";
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
  awaitingOms: boolean,
): OrderIssueDetailLineApi {
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

export type WmsOrderIssueDetailContentProps = {
  task: OrderIssueTaskListItemApi;
  warehouseId: number;
  onReload: () => void;
  onArchiveError: (message: string) => void;
};

/** Widok szczegółów braków — jedna akcja operacyjna z resolvera. */
export function WmsOrderIssueDetailContent({
  task,
  warehouseId,
  onReload,
  onArchiveError,
}: WmsOrderIssueDetailContentProps) {
  const navigate = useNavigate();
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const lifecyclePhase = resolveShortageLifecyclePhase(task);
  const awaitingOms = lifecyclePhase === "AWAITING_OMS";

  const primaryAction = useMemo(
    () =>
      brakiPrimaryAction(task, navigate, {
        tenantId: DAMAGE_TENANT_ID,
        warehouseId,
        onError: (msg) => setActionError(msg),
      }),
    [task, navigate, warehouseId],
  );

  const ctx = emptyContext(task.order_context);
  const shortageAsDetail = (task.shortage_lines ?? [])
    .filter((l) => l.missing_qty > 1e-9)
    .map((l) => shortageLineToDetailLine(l, awaitingOms));
  const remainingLines = (ctx.remaining_pick_lines ?? []).filter(
    (l) => (l.remaining_qty ?? l.missing_qty ?? 0) > 1e-9,
  );
  const collectedLines = ctx.collected_lines ?? [];
  const hasActiveShortageLines = shortageAsDetail.length > 0 || remainingLines.length > 0;

  const statusHeadline =
    (task.braki_workflow_status_label ?? "").trim() ||
    shortageLifecycleHeadline(lifecyclePhase);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log("braki detail", {
      taskId: task.id,
      orderId: task.order_id,
      lifecyclePhase,
      primaryAction: primaryAction.id,
    });
  }, [task.id, task.order_id, lifecyclePhase, primaryAction.id]);

  const onArchiveShortage = useCallback(async () => {
    if (task.can_close_shortage !== true) return;
    setActionPending(true);
    setActionError(null);
    try {
      await postWmsOrderIssueTaskArchive(DAMAGE_TENANT_ID, warehouseId, task.id);
      dispatchWmsShortagesUpdated();
      navigate(WMS_ROUTES.braki(), { replace: true });
    } catch {
      onArchiveError("Nie udało się usunąć zamówienia z kolejki Braki.");
    } finally {
      setActionPending(false);
    }
  }, [navigate, onArchiveError, task.id, warehouseId]);

  const onPrimaryClick = useCallback(async () => {
    if (primaryAction.disabled || actionPending) return;
    setActionError(null);
    if (primaryAction.id === "archive") {
      await onArchiveShortage();
      return;
    }
    setActionPending(true);
    try {
      await Promise.resolve(primaryAction.execute());
    } finally {
      setActionPending(false);
    }
  }, [actionPending, onArchiveShortage, primaryAction]);

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
        </header>

        <main className="custom-scrollbar flex-1 overflow-y-auto pb-32 md:pb-36">
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
                {shortageLifecycleHeadline(lifecyclePhase)}
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
                <span className="font-medium text-slate-500">Następny krok:</span>
                <span className="font-bold text-slate-800">{statusHeadline}</span>
              </div>
            </div>
          </div>

          {actionError ? (
            <div className="mx-4 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 md:mx-6">
              {actionError}
            </div>
          ) : null}

          {lifecyclePhase === "READY_TO_PACK" ? (
            <div className="mx-4 mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-5 text-center md:mx-6">
              <p className="text-sm font-bold text-blue-900">Zamówienie gotowe do pakowania</p>
              <p className="mt-1 text-xs text-blue-700">
                Wszystkie braki rozliczone — kontynuuj operację przyciskiem poniżej.
              </p>
            </div>
          ) : null}

          {collectedLines.length === 0 && !hasActiveShortageLines && lifecyclePhase !== "READY_TO_PACK" ? (
            <div className="m-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500 md:m-6">
              Brak pozycji na zamówieniu.
            </div>
          ) : (
            <>
              <IssueDetailSection title="Produkty zebrane" lines={collectedLines} variant="collected" />
              {hasActiveShortageLines ? (
                <IssueDetailSection
                  title={awaitingOms ? "Braki do decyzji OMS" : "Produkty do zebrania"}
                  lines={remainingLines.length > 0 ? remainingLines : shortageAsDetail}
                  variant="remaining"
                />
              ) : null}
            </>
          )}
        </main>

        <div className="absolute bottom-0 left-0 z-30 w-full border-t border-slate-200 bg-white p-4 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)] md:p-6">
          <button
            type="button"
            disabled={primaryAction.disabled || actionPending}
            onClick={() => void onPrimaryClick()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 md:text-base"
          >
            {actionPending ? "Przetwarzanie…" : primaryAction.label}
          </button>
        </div>
      </div>
    </div>
  );
}
