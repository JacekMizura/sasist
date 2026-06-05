import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  postWmsOrderIssueTaskArchive,
  postWmsOrderIssueTaskForceRemove,
  type OrderIssueOrderContextApi,
  type OrderIssueTaskListItemApi,
} from "../../api/wmsOrderIssueTasksApi";
import { extractApiErrorMessage } from "../../api/authApi";
import { ACTIVE_OPERATION_CONTEXT_BAR_OFFSET } from "../../components/wms/execution/activeOperationContext";
import { executionContextFromBrakiTask } from "../../components/wms/execution/syncExecutionContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { useWarehouseExecution } from "../../context/WarehouseExecutionContext";
import { BrakiForceRemoveModal, type BrakiForceRemoveMode } from "./BrakiForceRemoveModal";
import { brakiOperationalActions, type BrakiOperationalAction } from "./brakiWorkflowCta";
import { readBrakiOperationalState } from "./readBrakiOperationalState";
import { WMS_UI } from "./wmsTerminology";
import { WMS_ROUTES, dispatchWmsShortagesUpdated } from "./wmsRoutes";
import { IssueDetailSection } from "./WmsOrderIssueDetailPage";

function emptyContext(ctx: OrderIssueOrderContextApi | undefined): OrderIssueOrderContextApi {
  return (
    ctx ?? {
      collected_lines: [],
      shortage_decision_lines: [],
      remaining_pick_lines: [],
      relocation_lines: [],
      packing_ready_lines: [],
    }
  );
}

function actionButtonClass(action: BrakiOperationalAction): string {
  const base =
    "flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all focus:outline-none focus:ring-4 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 md:text-base";
  if (action.variant === "danger") {
    return `${base} border border-red-300 bg-white text-red-700 hover:bg-red-50 focus:ring-red-100`;
  }
  if (action.variant === "outline") {
    return `${base} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 focus:ring-slate-100`;
  }
  if (action.variant === "secondary") {
    return `${base} border border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100 focus:ring-indigo-100`;
  }
  return `${base} bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 focus:ring-blue-100`;
}

export type WmsOrderIssueDetailContentProps = {
  task: OrderIssueTaskListItemApi;
  warehouseId: number;
  onReload: () => void;
  onArchiveError: (message: string) => void;
};

/** Widok szczegółów braków — mieszane stany + wiele akcji z resolvera. */
export function WmsOrderIssueDetailContent({
  task,
  warehouseId,
  onReload,
  onArchiveError,
}: WmsOrderIssueDetailContentProps) {
  const navigate = useNavigate();
  const { setActiveContext, activeContext } = useWarehouseExecution();
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [forceRemoveOpen, setForceRemoveOpen] = useState(false);

  const ctx = emptyContext(task.order_context);
  const op = useMemo(() => readBrakiOperationalState(task), [task]);
  const ws = op.workstreams;

  const actions = useMemo(
    () =>
      brakiOperationalActions(task, navigate, {
        tenantId: DAMAGE_TENANT_ID,
        warehouseId,
        onError: (msg) => setActionError(msg),
        onSuccess: (msg) => {
          setSuccessMsg(msg);
          onReload();
        },
      }),
    [navigate, onReload, task, warehouseId],
  );

  const operationalActions = actions.filter((a) => a.id !== "archive");
  const archiveAction = actions.find((a) => a.id === "archive");

  const hasAnyLines =
    (ctx.collected_lines?.length ?? 0) > 0 ||
    (ctx.shortage_decision_lines?.length ?? 0) > 0 ||
    (ctx.remaining_pick_lines?.length ?? 0) > 0 ||
    (ctx.relocation_lines?.length ?? 0) > 0 ||
    (ctx.packing_ready_lines?.length ?? 0) > 0;

  useEffect(() => {
    setActiveContext(
      executionContextFromBrakiTask(task, {
        scanHint: "Zeskanuj inne zamówienie, aby przełączyć kartę",
      }),
    );
    return () => setActiveContext(null);
  }, [setActiveContext, task]);

  const onArchiveShortage = useCallback(
    async (mode?: BrakiForceRemoveMode) => {
      setActionPending("archive");
      setActionError(null);
      try {
        if (op.can_remove_from_braki && (mode == null || mode === "full")) {
          await postWmsOrderIssueTaskArchive(DAMAGE_TENANT_ID, warehouseId, task.id);
        } else if (mode != null) {
          await postWmsOrderIssueTaskForceRemove(DAMAGE_TENANT_ID, warehouseId, task.id, mode);
        } else {
          return;
        }
        dispatchWmsShortagesUpdated();
        navigate(WMS_ROUTES.braki(), { replace: true });
      } catch (e: unknown) {
        onArchiveError(extractApiErrorMessage(e, "Nie udało się usunąć zamówienia z kolejki Braki."));
      } finally {
        setActionPending(null);
        setForceRemoveOpen(false);
      }
    },
    [navigate, onArchiveError, op.can_remove_from_braki, task.id, warehouseId],
  );

  const runAction = useCallback(
    async (action: BrakiOperationalAction) => {
      if (action.disabled || actionPending) return;
      setActionError(null);
      setSuccessMsg(null);
      if (action.id === "archive") {
        setForceRemoveOpen(true);
        return;
      }
      setActionPending(action.id);
      try {
        await Promise.resolve(action.execute());
      } finally {
        setActionPending(null);
      }
    },
    [actionPending, onArchiveShortage],
  );

  const stickyTop = activeContext ? ACTIVE_OPERATION_CONTEXT_BAR_OFFSET : 0;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 antialiased">
      <div className="relative mx-auto flex h-full w-full max-w-4xl flex-col bg-white shadow-xl">
        <header
          className="sticky z-20 flex h-14 shrink-0 items-center border-b border-slate-200 bg-white px-2 md:h-16 md:px-4"
          style={{ top: stickyTop }}
        >
          <Link
            to={WMS_ROUTES.braki()}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 active:bg-slate-200"
          >
            <i className="fa-solid fa-arrow-left"></i>
            <span>Kolejka braków</span>
          </Link>
        </header>

        <main className="custom-scrollbar flex-1 overflow-y-auto pb-48 md:pb-52">
          <div className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600 md:px-6">
            <span className="font-medium text-slate-500">Klient: </span>
            <span className="font-semibold text-slate-800">
              {(task.customer_name ?? "").trim() || (task.delivery_name ?? "").trim() || "—"}
            </span>
          </div>

          {actionError ? (
            <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 md:mx-6">
              {actionError}
            </div>
          ) : null}

          {successMsg ? (
            <div className="mx-4 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 md:mx-6">
              {successMsg}
            </div>
          ) : null}

          {!hasAnyLines ? (
            <div className="m-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500 md:m-6">
              Brak pozycji na zamówieniu — odśwież lub sprawdź OMS.
            </div>
          ) : (
            <>
              <IssueDetailSection
                title="Produkty do zebrania"
                lines={ctx.remaining_pick_lines ?? []}
                variant="remaining"
              />
              <IssueDetailSection
                title="Braki do decyzji OMS"
                lines={ctx.shortage_decision_lines ?? []}
                variant="oms"
              />
              <IssueDetailSection
                title="Produkty do rozlokowania"
                lines={ctx.relocation_lines ?? []}
                variant="relocation"
              />
              <IssueDetailSection
                title="Gotowe do pakowania"
                lines={ctx.packing_ready_lines ?? []}
                variant="packing_ready"
              />
              <IssueDetailSection
                title="Produkty zebrane"
                lines={ctx.collected_lines ?? []}
                variant="collected"
              />
            </>
          )}

          {ws.has_relocation_work ? (
            <p className="mx-4 mt-2 text-xs text-slate-500 md:mx-6">
              {WMS_UI.productRelocation}: tylko zebrane produkty. Możesz rozlokować teraz lub dodać do
              dokumentu ZWK i wykonać zbiorczo później.
            </p>
          ) : null}
        </main>

        <div className="absolute bottom-0 left-0 z-30 w-full border-t border-slate-200 bg-white p-4 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)] md:p-6">
          <div className="space-y-2">
            {operationalActions.map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={action.disabled || actionPending != null}
                title={action.disabled ? action.disabledReason : undefined}
                onClick={() => void runAction(action)}
                className={actionButtonClass(action)}
              >
                {actionPending === action.id ? "Przetwarzanie…" : action.label}
              </button>
            ))}
            {archiveAction ? (
              <button
                type="button"
                disabled={actionPending != null}
                title="Usuń zamówienie z kolejki Braki WMS"
                onClick={() => void runAction(archiveAction)}
                className={actionButtonClass(archiveAction)}
              >
                {actionPending === "archive" ? "Usuwanie…" : archiveAction.label}
              </button>
            ) : null}
          </div>
        </div>

        <BrakiForceRemoveModal
          task={task}
          open={forceRemoveOpen}
          pending={actionPending === "archive"}
          onClose={() => setForceRemoveOpen(false)}
          onConfirm={(mode) => void onArchiveShortage(mode)}
        />
      </div>
    </div>
  );
}
