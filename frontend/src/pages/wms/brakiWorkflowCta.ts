import type { OrderIssueTaskListItemApi } from "../../api/wmsOrderIssueTasksApi";
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
  navigate: () => void;
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
): BrakiPrimaryCta {
  const wf = parseBrakiWorkflowStatus(task);
  const orderId = task.order_id;

  switch (wf) {
    case "ready_pack":
      return {
        label: "Przejdź do pakowania",
        navigate: () => navigate(WMS_ROUTES.packingOrder(orderId)),
      };
    case "relocation":
      return {
        label: "Przejdź do rozlokowania",
        navigate: () => navigate(WMS_ROUTES.operationalQueues),
      };
    case "relocation_partial":
      return {
        label: "Kontynuuj rozlokowanie",
        navigate: () => navigate(WMS_ROUTES.operationalQueues),
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
        label: "Otwórz zamówienie OMS",
        navigate: () => navigate(`/orders/${orderId}`),
      };
  }
}
