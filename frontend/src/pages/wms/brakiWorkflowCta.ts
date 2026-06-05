import type { OrderIssueTaskListItemApi } from "../../api/wmsOrderIssueTasksApi";
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

export type BrakiPrimaryCta = {
  label: string;
  /** Sync lub async (np. bootstrap sesji pakowania). */
  navigate: () => void | Promise<void>;
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

export function brakiPrimaryCta(
  task: OrderIssueTaskListItemApi,
  navigate: (path: string) => void,
  opts?: { warehouseId?: number; onPackingError?: (message: string) => void },
): BrakiPrimaryCta {
  const wf = parseBrakiWorkflowStatus(task);
  const orderId = task.order_id;
  const warehouseId = opts?.warehouseId;

  switch (wf) {
    case "ready_pack":
      return {
        label: "Przejdź do pakowania",
        navigate: () => {
          if (warehouseId == null || warehouseId < 1) {
            navigate(WMS_ROUTES.packingOrder(orderId));
            return;
          }
          return navigateBrakiToPacking(navigate, {
            warehouseId,
            orderId,
            redirectedFrom: "braki_workflow_cta",
            onError: opts?.onPackingError,
          });
        },
      };
    case "relocation":
      return {
        label: "Rozlokuj produkty",
        navigate: () => {
          const taskId = task.relocation_task_id;
          if (taskId != null && Number(taskId) > 0) {
            navigate(WMS_ROUTES.operationalRelocationTask(Number(taskId)));
            return;
          }
          navigate(WMS_ROUTES.braki(task.order_id));
        },
      };
    case "relocation_partial":
      return {
        label: "Kontynuuj rozlokowanie",
        navigate: () => {
          const taskId = task.relocation_task_id;
          if (taskId != null && Number(taskId) > 0) {
            navigate(WMS_ROUTES.operationalRelocationTask(Number(taskId)));
            return;
          }
          navigate(WMS_ROUTES.operationalQueues);
        },
      };
    case "pick":
    case "pick_and_relocation":
      return {
        label: "Przejdź do zbierania",
        navigate: () => navigate(WMS_ROUTES.pickingRecovery(orderId)),
      };
    case "awaiting":
    default:
      return {
        label: "Otwórz OMS",
        navigate: () => navigate(`/orders/${orderId}`),
      };
  }
}
