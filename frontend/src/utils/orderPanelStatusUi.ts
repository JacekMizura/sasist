import { ORDERS_PANEL_GROUP_LABELS } from "../components/orders/OrdersPanelStatusSidebar";
import type { OrderUiMainGroup } from "../types/orderUiStatus";

/** Polish title for panel main group (zamówienia / WMS — te same grupy). */
export function orderPanelGroupTitle(mainGroup: string): string {
  const key = (mainGroup || "").trim().toUpperCase() as OrderUiMainGroup;
  if (key === "NEW" || key === "IN_PROGRESS" || key === "DONE") {
    return ORDERS_PANEL_GROUP_LABELS[key];
  }
  return (mainGroup || "").trim() || "—";
}

/** Etykieta jak na panelu zamówień: „Nazwa — Grupa”. */
export function orderPanelStatusSelectLabel(opt: { id: number; name: string; main_group: string }): string {
  const name = (opt.name || "").trim() || `Status #${opt.id}`;
  return `${name} — ${orderPanelGroupTitle(opt.main_group)}`;
}
