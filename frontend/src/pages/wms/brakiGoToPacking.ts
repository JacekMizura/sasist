import { postWmsPackingOrderEnter, type WmsPackingEntryOutApi } from "../../api/wmsPackingApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { saveWmsPackingSession } from "./wmsPackingSession";
import { WMS_ROUTES } from "./wmsRoutes";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";

export type BrakiGoToPackingOptions = {
  warehouseId: number;
  orderId: number;
  redirectedFrom?: string;
  onError?: (message: string) => void;
};

/**
 * Bezpośrednie wejście na ekran pakowania zamówienia (sesja WMS + routing).
 * Nie przechodzi przez pulpit /wybór trybu pakowania.
 */
export async function navigateBrakiToPacking(
  navigate: (path: string) => void,
  opts: BrakiGoToPackingOptions,
): Promise<boolean> {
  const { warehouseId, orderId, redirectedFrom = "braki_detail", onError } = opts;
  if (!Number.isFinite(warehouseId) || warehouseId < 1 || !Number.isFinite(orderId) || orderId < 1) {
    onError?.("Brak identyfikatora zamówienia lub magazynu.");
    return false;
  }
  try {
    const entry: WmsPackingEntryOutApi = await postWmsPackingOrderEnter(
      DAMAGE_TENANT_ID,
      warehouseId,
      orderId,
      { sourceWorkflow: "shortage", redirectedFrom },
    );
    saveWmsPackingSession({
      statusId: entry.status_id,
      statusName: entry.status_name,
      statusColor: entry.status_color,
      mainGroup: entry.main_group as OrderUiMainGroup,
      mode: entry.mode,
      cartId: entry.cart_id ?? undefined,
      cartCode: entry.cart_code ?? undefined,
      cartType: entry.cart_type ?? undefined,
    });
    navigate(WMS_ROUTES.packingOrder(entry.order_id));
    return true;
  } catch {
    onError?.("Nie udało się otworzyć pakowania dla tego zamówienia.");
    return false;
  }
}
