import type { OrderIssueTaskListItemApi } from "../../api/wmsOrderIssueTasksApi";
import {
  postWmsRelocationAddItems,
  postWmsRelocationStartSession,
} from "../../api/wmsRelocationBatchApi";
import { extractApiErrorMessage } from "../../api/authApi";
import { navigateBrakiToPacking } from "./brakiGoToPacking";
import { WMS_ROUTES } from "./wmsRoutes";

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

export type BrakiPrimaryActionId =
  | "open_oms"
  | "recovery_pick"
  | "relocation"
  | "packing"
  | "archive"
  | "waiting_supply";

export type BrakiPrimaryAction = {
  id: BrakiPrimaryActionId;
  label: string;
  phase: ShortageLifecyclePhase;
  disabled?: boolean;
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

/** SSOT phase from API; legacy braki_workflow_status only when phase absent. */
export function resolveShortageLifecyclePhase(task: OrderIssueTaskListItemApi): ShortageLifecyclePhase {
  const fromApi = (task.shortage_lifecycle_phase ?? "").trim().toUpperCase();
  const allowed: ShortageLifecyclePhase[] = [
    "SHORTAGE_DETECTED",
    "AWAITING_OMS",
    "WAITING_SUPPLY",
    "RECOVERY_PICK",
    "RELOCATION_REQUIRED",
    "READY_TO_PACK",
    "DONE",
  ];
  if (allowed.includes(fromApi as ShortageLifecyclePhase)) {
    return fromApi as ShortageLifecyclePhase;
  }

  const wf = parseBrakiWorkflowStatus(task);
  if (wf === "awaiting") return "AWAITING_OMS";
  if (wf === "pick" || wf === "pick_and_relocation") return "RECOVERY_PICK";
  if (wf === "relocation" || wf === "relocation_partial") return "RELOCATION_REQUIRED";
  if (wf === "ready_pack") return "READY_TO_PACK";
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

async function executeRelocation(
  task: OrderIssueTaskListItemApi,
  navigate: (path: string) => void,
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

/**
 * Dokładnie jedna akcja operacyjna — wyłącznie z fazy lifecycle resolvera.
 */
export function brakiPrimaryAction(
  task: OrderIssueTaskListItemApi,
  navigate: (path: string) => void,
  opts: {
    tenantId: number;
    warehouseId: number;
    onError?: (message: string) => void;
  },
): BrakiPrimaryAction {
  const phase = resolveShortageLifecyclePhase(task);
  const orderId = task.order_id;

  switch (phase) {
    case "AWAITING_OMS":
      return {
        id: "open_oms",
        label: "Otwórz OMS",
        phase,
        execute: () => navigate(`/orders/${orderId}`),
      };

    case "WAITING_SUPPLY":
      return {
        id: "waiting_supply",
        label: "Oczekuje na dostawę",
        phase,
        disabled: true,
        execute: () => {},
      };

    case "RECOVERY_PICK":
      return {
        id: "recovery_pick",
        label: "Przejdź do zbierania",
        phase,
        execute: () => navigate(WMS_ROUTES.pickingRecovery(orderId)),
      };

    case "RELOCATION_REQUIRED":
      return {
        id: "relocation",
        label: "Rozłóż produkty",
        phase,
        execute: () =>
          executeRelocation(task, navigate, {
            tenantId: opts.tenantId,
            warehouseId: opts.warehouseId,
            onError: opts.onError,
          }),
      };

    case "READY_TO_PACK":
      return {
        id: "packing",
        label: "Przejdź do pakowania",
        phase,
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
      };

    case "DONE":
      return {
        id: "archive",
        label: "Usuń z Braków",
        phase,
        disabled: task.can_close_shortage !== true,
        execute: () => {},
      };

    default:
      return {
        id: "open_oms",
        label: "Otwórz OMS",
        phase: "SHORTAGE_DETECTED",
        execute: () => navigate(`/orders/${orderId}`),
      };
  }
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
