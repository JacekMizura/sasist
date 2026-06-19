import type { OrderPanelFilter } from "../../orders/OrderStatusSidebar";
import { ORDERS_PANEL_GROUP_LABELS } from "../../orders/OrdersPanelStatusSidebar";
import type { OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";

export function formatOrderPanelFilterLabel(
  panelFilter: OrderPanelFilter,
  panelSummary: OrderUiStatusPanelSummary | null,
): string {
  if (panelFilter === "unassigned") return "Bez etykiety";
  if (panelFilter === "all") return "Wszystkie";
  if (typeof panelFilter === "object" && panelFilter.kind === "group") {
    return ORDERS_PANEL_GROUP_LABELS[panelFilter.group];
  }
  if (typeof panelFilter === "object" && panelFilter.kind === "sub") {
    for (const block of panelSummary?.groups ?? []) {
      for (const s of block.sub_statuses) {
        if (s.id === panelFilter.id) {
          return `${ORDERS_PANEL_GROUP_LABELS[block.main_group]} — ${s.name}`;
        }
      }
    }
    return `Etykieta #${panelFilter.id}`;
  }
  return "Wszystkie";
}
