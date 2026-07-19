import type {
  PickingFlowMode,
  PickingFlowStrategy,
  WmsPickingOrderSort,
  WmsPickingPickUnit,
} from "../../api/wmsPickingEntryApi";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import type { LocationPickListRow } from "./locationPickingTypes";

export type WmsPickingOrderTypeChoice = "single" | "multi" | "all";

/** Sesja zbierania — przekazywana między krokami (status → typ → wózek → lokalizacje). */
export type WmsPickingSessionState = {
  orderUiStatusId: number;
  orderUiStatusName: string;
  orderUiStatusColor: string;
  mainGroup: OrderUiMainGroup;
  /** Kanoniczny kod wózka z API (np. CART-0001) — skan / identyfikator kontenera. */
  cartCode?: string | null;
  /** Nazwa wózka z API (wyświetlanie); opcjonalna. */
  cartName?: string | null;
  /** Po ``GET /wms/picking/resolve-cart`` — używane przy kompletacji i zakończeniu (bez ponownego skanu). */
  cartId?: number | null;
  targetStatusId?: number;
  strategy?: PickingFlowStrategy;
  pickUnit?: WmsPickingPickUnit;
  orderSort?: WmsPickingOrderSort;
  singleMode?: PickingFlowMode;
  multiMode?: PickingFlowMode;
  limitsSingle?: number | null;
  limitsMulti?: number | null;
  orderTypeChoice?: WmsPickingOrderTypeChoice;
  /** Dogrywka recovery — jedno zamówienie; URL ``/wms/picking/recovery/:id`` lub stan nawigacji. */
  recoveryOrderId?: number | null;
  /** Skąd wraca ekran skanu wózka. */
  preCartBack?: "status" | "order-type";
  /** Snapshot z kafelka statusu — belka liczników przed wczytaniem listy produktów. */
  hubOrderCount?: number;
  hubPickStats?: { zebrane: number; doZebrania: number; wTrakcie: number; braki?: number };
  /** Po starcie zbierania bez FINAL assignment — komunikat operatora (bez kodów technicznych). */
  assignEmptyMessage?: string | null;
};

export type WmsPickingLocationNavState = {
  pickList?: LocationPickListRow[];
  pickingSession?: WmsPickingSessionState;
};

/** Router state dla `/wms/picking/cart`. */
export type WmsPickingCartNavState = {
  pickingSession: WmsPickingSessionState;
};

/** Router state dla `/wms/picking/order-type`. */
export type WmsPickingOrderTypeNavState = {
  pickingSession: WmsPickingSessionState;
};

/** Router state dla `/wms/picking/products` i `/wms/picking/products/:id`. */
export type WmsPickingProductsNavState = {
  pickingSession: WmsPickingSessionState;
  /** Po zgłoszeniu braku — wymuś natychmiastowe ponowne wczytanie listy produktów. */
  pickingListRefreshAt?: number;
};

/** Router state dla `/wms/product-preview/:productId` (podgląd operacyjny WMS). */
export type WmsProductPreviewNavState = {
  /** Opcjonalnie — brak gdy wejście z huba „Podgląd produktu”. */
  pickingSession?: WmsPickingSessionState | null;
  orderType?: WmsPickingOrderTypeChoice;
  returnPath?: string;
  returnState?: WmsPickingProductsNavState | null;
};
