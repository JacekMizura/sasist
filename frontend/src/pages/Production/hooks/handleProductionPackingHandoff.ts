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

function waybillToastLabel(count: number): string {
  if (count <= 0) return "Pakowanie zakończone automatycznie — list przewozowy był już wygenerowany.";
  if (count === 1) return "Pakowanie zakończone automatycznie. Wydrukowano 1 list przewozowy.";
  if (count < 5) return `Pakowanie zakończone automatycznie. Wydrukowano ${count} listy przewozowe.`;
  return `Pakowanie zakończone automatycznie. Wydrukowano ${count} listów przewozowych.`;
}

/**
 * Operator toast / optional navigate after ORDERS MO progress.
 * When backend auto-packs (all waybills present), skip packing UI and run the same
 * client print actions as packing finish.
 */
export async function handleProductionPackingHandoff(
  order: ProductionOrderRead,
  navigate: NavigateFunction,
  opts: ProductionPackingHandoffOpts,
): Promise<void> {
  const handoff = order.packing_handoff;
  if (handoff == null) return;
  const ready = handoff.newly_ready_orders ?? [];
  if (ready.length === 0) return;

  const auto = handoff.auto_pack;
  if (auto?.succeeded) {
    const n =
      Number(auto.waybill_print_count) ||
      (auto.waybill_file_urls?.length ?? 0) ||
      0;
    toast.success(waybillToastLabel(n));
    const ext = loadWmsPackingExtendedUi(opts.warehouseId);
    let printDocumentEnabled = false;
    try {
      const apiSettings = await getWmsPackingSettings(opts.tenantId, opts.warehouseId);
      printDocumentEnabled = Boolean(apiSettings?.auto_actions?.print_document);
    } catch {
      /* soft-fail settings — still print waybills from pipeline */
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
          // Auto-pack: always deliver existing waybills (injected on BE if needed).
          printLabelEnabled: true,
          printCopyOfSalesDoc: Boolean(ext.printCopyOfSalesDoc),
          chooseWaybillPrintCount: false,
        });
      } catch {
        /* soft-fail — same as packing UI */
      }
    }
    return;
  }

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
