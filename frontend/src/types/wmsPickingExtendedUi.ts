/**
 * Rozszerzone ustawienia UI zbierania WMS — wyłącznie frontend (localStorage).
 * Konfiguracja statusów (picking_config) pozostaje przez API jak dotychczas.
 */

export type PickingListDensity = "comfortable" | "compact";
export type AfterBatchCompleteAction = "assign_new_batch" | "back_to_list" | "stay_here";
export type BatchManagementMode = "manual" | "auto_assign_picker" | "full_auto";
export type DefaultPickingContainerType = "cart" | "cart_with_baskets" | "basket";

export type WmsPickingExtendedUiSettings = {
  showProductImage: boolean;
  showEAN: boolean;
  showSKU: boolean;
  showCatalogNumber: boolean;
  showStock: boolean;
  showLocation: boolean;
  compactMode: boolean;
  listDensity: PickingListDensity;
  showCourierBadge: boolean;
  showPriorityBadge: boolean;

  shortageOrderStatusId: number | null;
  afterBatchCompleteAction: AfterBatchCompleteAction;
  separateDirectSalesOrders: boolean;
  allowPickInsidePackingMode: boolean;

  requireProductScanAtLeastOnce: boolean;
  requireLocationScan: boolean;
  disableForceLocationScanWhenManyLocations: boolean;
  allowReserveLocationPicking: boolean;
  allowProductsWithoutLabelsToBaskets: boolean;
  disableAutoDetachMissingOrdersFromCarts: boolean;

  multiItemBatchOrdersCount: number;
  singleItemBatchOrdersCount: number;
  singleItemVolumeLimit: number;
  batchManagementMode: BatchManagementMode;
  sortOrdersByCourier: boolean;
  sortOrdersByAge: boolean;
  prioritizeExpressOrders: boolean;

  defaultPickingContainerType: DefaultPickingContainerType;
  autoSuggestCart: boolean;
  autoSuggestRoute: boolean;
  requireCartScanStart: boolean;
  requireBasketScanStart: boolean;

  splitWorkBetweenWarehouses: boolean;
  ignoreLocationStockLevels: boolean;
  mainPickingWarehouse: string;
  fallbackWarehouse: string;
  zonePickingEnabled: boolean;

  autoStartNextOrder: boolean;
  autoOpenScanner: boolean;
  autoMarkPickedLines: boolean;
  autoMoveToPackingStatus: boolean;
  autoPrintTransferLabels: boolean;

  showAllNotes: boolean;
  notesPopup: boolean;
  showWarnings: boolean;
  showMissingProductsHints: boolean;

  supplierAvailabilityCheck: boolean;
  legacyMode: boolean;
  debugMode: boolean;
  advancedRoutingMode: boolean;
};

export const DEFAULT_WMS_PICKING_EXTENDED_UI: WmsPickingExtendedUiSettings = {
  showProductImage: true,
  showEAN: true,
  showSKU: true,
  showCatalogNumber: false,
  showStock: true,
  showLocation: true,
  compactMode: false,
  listDensity: "comfortable",
  showCourierBadge: true,
  showPriorityBadge: true,

  shortageOrderStatusId: null,
  afterBatchCompleteAction: "stay_here",
  separateDirectSalesOrders: false,
  allowPickInsidePackingMode: false,

  requireProductScanAtLeastOnce: true,
  requireLocationScan: false,
  disableForceLocationScanWhenManyLocations: false,
  allowReserveLocationPicking: false,
  allowProductsWithoutLabelsToBaskets: false,
  disableAutoDetachMissingOrdersFromCarts: false,

  multiItemBatchOrdersCount: 10,
  singleItemBatchOrdersCount: 15,
  singleItemVolumeLimit: 0,
  batchManagementMode: "manual",
  sortOrdersByCourier: false,
  sortOrdersByAge: true,
  prioritizeExpressOrders: true,

  defaultPickingContainerType: "cart_with_baskets",
  autoSuggestCart: true,
  autoSuggestRoute: false,
  requireCartScanStart: false,
  requireBasketScanStart: false,

  splitWorkBetweenWarehouses: false,
  ignoreLocationStockLevels: false,
  mainPickingWarehouse: "",
  fallbackWarehouse: "",
  zonePickingEnabled: false,

  autoStartNextOrder: false,
  autoOpenScanner: true,
  autoMarkPickedLines: false,
  autoMoveToPackingStatus: false,
  autoPrintTransferLabels: false,

  showAllNotes: true,
  notesPopup: false,
  showWarnings: true,
  showMissingProductsHints: true,

  supplierAvailabilityCheck: false,
  legacyMode: false,
  debugMode: false,
  advancedRoutingMode: false,
};

export function storageKeyWmsPickingExtendedUi(warehouseId: number): string {
  return `wms-picking-extended-ui:v1:${warehouseId}`;
}

export function loadWmsPickingExtendedUi(warehouseId: number): WmsPickingExtendedUiSettings {
  try {
    const raw = localStorage.getItem(storageKeyWmsPickingExtendedUi(warehouseId));
    if (!raw) return { ...DEFAULT_WMS_PICKING_EXTENDED_UI };
    const parsed = JSON.parse(raw) as Partial<WmsPickingExtendedUiSettings>;
    return { ...DEFAULT_WMS_PICKING_EXTENDED_UI, ...parsed };
  } catch {
    return { ...DEFAULT_WMS_PICKING_EXTENDED_UI };
  }
}

export function saveWmsPickingExtendedUi(warehouseId: number, data: WmsPickingExtendedUiSettings): void {
  try {
    localStorage.setItem(storageKeyWmsPickingExtendedUi(warehouseId), JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function clearWmsPickingExtendedUi(warehouseId: number): void {
  try {
    localStorage.removeItem(storageKeyWmsPickingExtendedUi(warehouseId));
  } catch {
    /* ignore */
  }
}
