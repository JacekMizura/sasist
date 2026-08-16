import type { NavigateFunction } from "react-router-dom";
import toast from "react-hot-toast";
import type { ProductionOrderRead } from "@/api/productionApi";
import { getWmsPackingSettings } from "@/api/wmsPackingSettingsApi";
import type { WmsPackingPostPackStepApi } from "@/api/wmsPackingApi";
import { runPackingPostFinishClientActions } from "@/components/wms/packing/packingPostFinishClientActions";
import { loadWmsPackingExtendedUi } from "@/types/wmsPackingExtendedUi";
import { WMS_ROUTES } from "../../wms/wmsRoutes";

export type ProductionPackingHandoffOpts = {
  tenantId: number;
  warehouseId: number;
};

export type PackingHandoffHandleResult = {
  acted: boolean;
  kind: "none" | "auto_pack" | "open_packing" | "status_only";
  navigatedToPacking: boolean;
};

/** Session-scoped: same actionable handoff must not toast/navigate twice (replay/render). */
const handledHandoffKeys = new Set<string>();

/** Test-only reset of FE handoff idempotency. */
export function resetProductionPackingHandoffHandledForTests(): void {
  handledHandoffKeys.clear();
}

export function hasActionablePackingHandoff(order: ProductionOrderRead | null | undefined): boolean {
  const ready = order?.packing_handoff?.newly_ready_orders ?? [];
  return ready.length > 0;
}

/**
 * Single owner selection for registerProductionQty:
 * progress carries auto_pack / newly_ready; finish-production does not attach handoff.
 * Prefer progress when it has actionable handoff; otherwise finish (if any).
 */
export function selectPackingHandoffCarrier(
  progressOrder: ProductionOrderRead | null | undefined,
  finishOrder: ProductionOrderRead | null | undefined,
): ProductionOrderRead | null {
  if (hasActionablePackingHandoff(progressOrder)) return progressOrder ?? null;
  if (hasActionablePackingHandoff(finishOrder)) return finishOrder ?? null;
  return null;
}

function handoffFingerprint(order: ProductionOrderRead): string | null {
  const handoff = order.packing_handoff;
  if (handoff == null) return null;
  const ready = handoff.newly_ready_orders ?? [];
  if (ready.length === 0) return null;
  const readyIds = ready
    .map((r) => Number(r.order_id))
    .filter((id) => Number.isFinite(id))
    .sort((a, b) => a - b)
    .join(",");
  const auto = handoff.auto_pack;
  const autoPart = auto?.succeeded
    ? `auto:${Number(auto.waybill_print_count) || 0}`
    : auto?.attempted
      ? `auto_fail:${String(auto.fallback_reason || "")}`
      : "no_auto";
  const moId = order.id != null ? String(order.id) : "mo?";
  return `mo:${moId}|ready:${readyIds}|${autoPart}|${handoff.after_production_action}`;
}

function waybillToastLabel(count: number): string {
  if (count <= 0) return "Pakowanie zakończone automatycznie — list przewozowy był już wygenerowany.";
  if (count === 1) return "Pakowanie zakończone automatycznie. Wydrukowano 1 list przewozowy.";
  if (count < 5) return `Pakowanie zakończone automatycznie. Wydrukowano ${count} listy przewozowe.`;
  return `Pakowanie zakończone automatycznie. Wydrukowano ${count} listów przewozowych.`;
}

const EMPTY_RESULT: PackingHandoffHandleResult = {
  acted: false,
  kind: "none",
  navigatedToPacking: false,
};

/**
 * Operator toast / optional navigate after ORDERS MO progress.
 * When backend auto-packs (all waybills present), skip packing UI and run the same
 * client print actions as packing finish — including the same print_label setting gate.
 *
 * Idempotent per session fingerprint: identical handoff must not toast/navigate again.
 */
export async function handleProductionPackingHandoff(
  order: ProductionOrderRead,
  navigate: NavigateFunction,
  opts: ProductionPackingHandoffOpts,
): Promise<PackingHandoffHandleResult> {
  const handoff = order.packing_handoff;
  if (handoff == null) return EMPTY_RESULT;
  const ready = handoff.newly_ready_orders ?? [];
  if (ready.length === 0) return EMPTY_RESULT;

  const fp = handoffFingerprint(order);
  if (fp != null && handledHandoffKeys.has(fp)) {
    return EMPTY_RESULT;
  }
  if (fp != null) handledHandoffKeys.add(fp);

  const auto = handoff.auto_pack;
  if (auto?.succeeded) {
    // should_print_shipping_label = packing settings + pipeline (not label existence).
    const n = Number(auto.waybill_print_count) || 0;
    toast.success(waybillToastLabel(n));
    const ext = loadWmsPackingExtendedUi(opts.warehouseId);
    let printDocumentEnabled = false;
    let printLabelEnabled = false;
    try {
      const apiSettings = await getWmsPackingSettings(opts.tenantId, opts.warehouseId);
      printDocumentEnabled = Boolean(apiSettings?.auto_actions?.print_document);
      // Same contract as usePackingOrderController after packing_finish_order.
      printLabelEnabled = Boolean(apiSettings?.auto_actions?.print_label);
    } catch {
      /* soft-fail settings — pipeline steps still gate client actions */
    }
    for (const one of auto.orders ?? []) {
      try {
        await runPackingPostFinishClientActions({
          tenantId: opts.tenantId,
          warehouseId: opts.warehouseId,
          pipeline: (one.post_pack_pipeline ?? []) as WmsPackingPostPackStepApi[],
          afterSalesDocumentAction: ext.afterSalesDocumentAction,
          afterWaybillAction: ext.afterWaybillAction,
          printDocumentEnabled,
          printLabelEnabled,
          printCopyOfSalesDoc: Boolean(ext.printCopyOfSalesDoc),
          chooseWaybillPrintCount: false,
        });
      } catch {
        /* soft-fail — same as packing UI */
      }
    }
    return { acted: true, kind: "auto_pack", navigatedToPacking: false };
  }

  const openPacking = handoff.after_production_action === "OPEN_PACKING";
  const label = (n: string) => (n.startsWith("#") ? n : `#${n}`);

  if (ready.length === 1) {
    const one = ready[0]!;
    const num = label(one.order_number);
    if (openPacking) {
      toast.success(`Zamówienie ${num} gotowe do pakowania. Otwieram pakowanie.`);
      navigate(WMS_ROUTES.packingOrder(one.order_id));
      return { acted: true, kind: "open_packing", navigatedToPacking: true };
    }
    toast.success(`Zamówienie ${num} gotowe do pakowania.`);
    return { acted: true, kind: "status_only", navigatedToPacking: false };
  }

  const nums = ready.map((r) => label(r.order_number)).join(", ");
  if (openPacking) {
    toast.success(`Zamówienia gotowe do pakowania: ${nums}. Wybierz z listy pakowania.`);
    navigate(WMS_ROUTES.packingOrders);
    return { acted: true, kind: "open_packing", navigatedToPacking: true };
  }
  toast.success(`Zamówienia gotowe do pakowania: ${nums}.`);
  return { acted: true, kind: "status_only", navigatedToPacking: false };
}
