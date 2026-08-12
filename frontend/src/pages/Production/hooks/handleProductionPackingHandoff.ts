import type { NavigateFunction } from "react-router-dom";
import toast from "react-hot-toast";
import type { ProductionOrderRead } from "@/api/productionApi";
import { WMS_ROUTES } from "../../wms/wmsRoutes";

/**
 * Operator-only toast / optional navigate after ORDERS MO progress.
 * Backend only stores after_production_action preference — no global redirect.
 */
export function handleProductionPackingHandoff(
  order: ProductionOrderRead,
  navigate: NavigateFunction,
): void {
  const handoff = order.packing_handoff;
  if (handoff == null) return;
  const ready = handoff.newly_ready_orders ?? [];
  if (ready.length === 0) return;

  const openPacking = handoff.after_production_action === "OPEN_PACKING";
  const label = (n: string) => (n.startsWith("#") ? n : `#${n}`);

  if (ready.length === 1) {
    const one = ready[0]!;
    const num = label(one.order_number);
    if (openPacking) {
      toast.success(`Zamówienie ${num} gotowe do pakowania. Otwieram pakowanie.`);
      navigate(WMS_ROUTES.packingOrder(one.order_id));
    } else {
      toast.success(`Zamówienie ${num} gotowe do pakowania.`);
    }
    return;
  }

  const nums = ready.map((r) => label(r.order_number)).join(", ");
  if (openPacking) {
    toast.success(`Zamówienia gotowe do pakowania: ${nums}. Wybierz z listy pakowania.`);
    navigate(WMS_ROUTES.packingOrders);
  } else {
    toast.success(`Zamówienia gotowe do pakowania: ${nums}.`);
  }
}
