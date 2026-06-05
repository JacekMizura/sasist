import type { OrderIssueTaskListItemApi } from "../../api/wmsOrderIssueTasksApi";
import {
  postWmsRelocationAddItems,
  postWmsRelocationStartSession,
} from "../../api/wmsRelocationBatchApi";
import { extractApiErrorMessage } from "../../api/authApi";
import { navigateBrakiToPacking } from "./brakiGoToPacking";
import type { BrakiWorkstreams } from "./brakiWorkstreamTypes";
import { readBrakiOperationalState, readBrakiWorkstreams } from "./readBrakiOperationalState";
import { WMS_UI } from "./wmsTerminology";
import { WMS_ROUTES } from "./wmsRoutes";

export type { BrakiWorkstreams } from "./brakiWorkstreamTypes";

export type BrakiWorkflowStatusId =
  | "awaiting"
  | "pick"
  | "pick_and_relocation"
  | "relocation"
  | "relocation_partial"
  | "ready_pack"
  | "";

export type ShortageLifecyclePhase =
  | "SHORTAGE_DETECTED"
  | "AWAITING_OMS"
  | "WAITING_SUPPLY"
  | "RECOVERY_PICK"
  | "RELOCATION_REQUIRED"
  | "READY_TO_PACK"
  | "DONE";

export type BrakiActionId =
  | "open_oms"
  | "recovery_pick"
  | "relocation_now"
  | "relocation_document"
  | "packing"
  | "archive"
  | "waiting_supply";

export type BrakiOperationalAction = {
  id: BrakiActionId;
  label: string;
  variant: "primary" | "secondary" | "outline" | "danger";
  disabled?: boolean;
  disabledReason?: string;
  execute: () => void | Promise<void>;
};

export function parseBrakiWorkflowStatus(task: OrderIssueTaskListItemApi): BrakiWorkflowStatusId {
  const s = (task.braki_workflow_status ?? "").trim();
  if (
    s === "awaiting" ||
    s === "pick" ||
    s === "pick_and_relocation" ||
    s === "relocation" ||
    s === "relocation_partial" ||
    s === "ready_pack"
  ) {
    return s;
  }
  return "";
}

/** Faza lifecycle — wyłącznie z resolvera (braki_operational_state lub shortage_lifecycle_phase). */
export function resolveShortageLifecyclePhase(task: OrderIssueTaskListItemApi): ShortageLifecyclePhase {
  const fromOp = readBrakiOperationalState(task).shortage_lifecycle_phase.toUpperCase();
  const fromApi = (task.shortage_lifecycle_phase ?? "").trim().toUpperCase();
  const phase = fromOp || fromApi;
  const allowed: ShortageLifecyclePhase[] = [
    "SHORTAGE_DETECTED",
    "AWAITING_OMS",
    "WAITING_SUPPLY",
    "RECOVERY_PICK",
    "RELOCATION_REQUIRED",
    "READY_TO_PACK",
    "DONE",
  ];
  if (allowed.includes(phase as ShortageLifecyclePhase)) {
    return phase as ShortageLifecyclePhase;
  }
  return "SHORTAGE_DETECTED";
}

export function shortageLifecycleHeadline(phase: ShortageLifecyclePhase): string {
  switch (phase) {
    case "AWAITING_OMS":
      return "Oczekuje na decyzję OMS";
    case "WAITING_SUPPLY":
      return "Oczekuje na dostawę";
    case "RECOVERY_PICK":
      return "Wymagana dogrywka zbierki";
    case "RELOCATION_REQUIRED":
      return "Wymagane rozlokowanie produktów";
    case "READY_TO_PACK":
      return "Gotowe do pakowania";
    case "DONE":
      return "Brak rozliczony — usuń z kolejki";
    default:
      return "Braki w realizacji";
  }
}

/** Aktywne strumienie pracy — wyłącznie z braki_operational_state (bez inferencji). */
export function deriveBrakiWorkstreams(task: OrderIssueTaskListItemApi): BrakiWorkstreams {
  return readBrakiWorkstreams(task);
}

export function brakiMixedStateSummary(task: OrderIssueTaskListItemApi): string {
  const op = readBrakiOperationalState(task);
  if (op.workflow_stage) return op.workflow_stage;
  const ws = op.workstreams;
  const parts: string[] = [];
  if (ws.has_oms_pending) parts.push("decyzja OMS");
  if (ws.has_pick_work) parts.push("dogrywka");
  if (ws.has_relocation_work) parts.push(WMS_UI.productRelocation);
  if (ws.has_packing_ready) parts.push("pakowanie");
  if (parts.length === 0) {
    return (task.braki_workflow_status_label ?? "").trim() || shortageLifecycleHeadline(resolveShortageLifecyclePhase(task));
  }
  return parts.join(" · ");
}

async function executeRelocationNow(
  task: OrderIssueTaskListItemApi,
  navigate: (path: string, opts?: { state?: unknown }) => void,
  opts: { tenantId: number; warehouseId: number; onError?: (msg: string) => void },
): Promise<void> {
  const taskId =
    task.relocation_task_id != null && Number(task.relocation_task_id) > 0
      ? Number(task.relocation_task_id)
      : null;

  if (taskId != null) {
    navigate(WMS_ROUTES.operationalRelocationTask(taskId), {
      state: { startRelocationSession: true },
    });
    return;
  }

  try {
    const added = await postWmsRelocationAddItems(opts.tenantId, opts.warehouseId, {
      order_id: task.order_id,
    });
    const started = await postWmsRelocationStartSession(opts.tenantId, opts.warehouseId, {
      order_id: task.order_id,
      task_id: added.relocation_task_id ?? undefined,
    });
    navigate(WMS_ROUTES.operationalRelocationTask(started.task_id), {
      state: { startRelocationSession: true },
    });
  } catch (e: unknown) {
    opts.onError?.(extractApiErrorMessage(e, "Nie udało się rozpocząć rozlokowania produktów."));
  }
}

async function executeRelocationAddToDocument(
  task: OrderIssueTaskListItemApi,
  opts: {
    tenantId: number;
    warehouseId: number;
    onSuccess?: (msg: string) => void;
    onError?: (msg: string) => void;
  },
): Promise<void> {
  try {
    const out = await postWmsRelocationAddItems(opts.tenantId, opts.warehouseId, {
      order_id: task.order_id,
    });
    opts.onSuccess?.(
      `Dodano ${out.lines_added} poz. do dokumentu ${out.document_label}. Rozlokowanie możesz wykonać później.`,
    );
  } catch (e: unknown) {
    opts.onError?.(extractApiErrorMessage(e, "Nie udało się dodać pozycji do dokumentu rozlokowania."));
  }
}

/**
 * Wszystkie dostępne akcje operacyjne — mieszane stany mogą mieć wiele przycisków.
 */
export function brakiOperationalActions(
  task: OrderIssueTaskListItemApi,
  navigate: (path: string, opts?: { state?: unknown }) => void,
  opts: {
    tenantId: number;
    warehouseId: number;
    onError?: (message: string) => void;
    onSuccess?: (message: string) => void;
  },
): BrakiOperationalAction[] {
  const ws = deriveBrakiWorkstreams(task);
  const orderId = task.order_id;
  const actions: BrakiOperationalAction[] = [];

  if (ws.has_oms_pending) {
    actions.push({
      id: "open_oms",
      label: "Otwórz OMS",
      variant: "outline",
      execute: () => navigate(`/orders/${orderId}`),
    });
  }

  if (ws.has_pick_work) {
    actions.push({
      id: "recovery_pick",
      label: "Przejdź do dogrywki",
      variant: "primary",
      execute: () => navigate(WMS_ROUTES.pickingRecovery(orderId)),
    });
  }

  if (ws.has_relocation_work) {
    actions.push({
      id: "relocation_now",
      label: "Rozlokuj teraz",
      variant: ws.has_pick_work ? "secondary" : "primary",
      execute: () =>
        executeRelocationNow(task, navigate, {
          tenantId: opts.tenantId,
          warehouseId: opts.warehouseId,
          onError: opts.onError,
        }),
    });
    actions.push({
      id: "relocation_document",
      label: "Dodaj do dokumentu rozlokowania",
      variant: "outline",
      execute: () =>
        executeRelocationAddToDocument(task, {
          tenantId: opts.tenantId,
          warehouseId: opts.warehouseId,
          onError: opts.onError,
          onSuccess: opts.onSuccess,
        }),
    });
  }

  if (ws.has_packing_ready) {
    actions.push({
      id: "packing",
      label: "Przejdź do pakowania",
      variant: "primary",
      execute: () => {
        if (opts.warehouseId < 1) {
          navigate(WMS_ROUTES.packingOrder(orderId));
          return;
        }
        return navigateBrakiToPacking(navigate, {
          warehouseId: opts.warehouseId,
          orderId,
          redirectedFrom: "braki_detail",
          onError: opts.onError,
        });
      },
    });
  }

  const phase = resolveShortageLifecyclePhase(task);
  if (phase === "WAITING_SUPPLY" && !ws.has_pick_work && !ws.has_relocation_work) {
    actions.push({
      id: "waiting_supply",
      label: "Oczekuje na dostawę",
      variant: "outline",
      disabled: true,
      execute: () => {},
    });
  }

  actions.push({
    id: "archive",
    label: "Usuń z Braki WMS",
    variant: "danger",
    execute: () => {},
  });

  return actions;
}

/** Sugerowana akcja (pierwsza niedisabled, nie archive). */
export function brakiPrimaryAction(
  task: OrderIssueTaskListItemApi,
  navigate: (path: string, opts?: { state?: unknown }) => void,
  opts: {
    tenantId: number;
    warehouseId: number;
    onError?: (message: string) => void;
    onSuccess?: (message: string) => void;
  },
): BrakiOperationalAction {
  const actions = brakiOperationalActions(task, navigate, opts);
  const primary = actions.find((a) => a.id !== "archive" && !a.disabled);
  if (primary) return primary;
  const archive = actions.find((a) => a.id === "archive");
  return (
    archive ?? {
      id: "open_oms",
      label: "Otwórz OMS",
      variant: "outline",
      execute: () => navigate(`/orders/${task.order_id}`),
    }
  );
}

/** @deprecated Use brakiPrimaryAction — kept for list cards if needed. */
export function brakiPrimaryCta(
  task: OrderIssueTaskListItemApi,
  navigate: (path: string) => void,
  opts?: { warehouseId?: number; onPackingError?: (message: string) => void },
): { label: string; navigate: () => void | Promise<void> } {
  const action = brakiPrimaryAction(task, navigate, {
    tenantId: 1,
    warehouseId: opts?.warehouseId ?? 0,
    onError: opts?.onPackingError,
  });
  return { label: action.label, navigate: action.execute };
}
