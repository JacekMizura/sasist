/**
 * Rozszerzone ustawienia UI zbierania WMS.
 * Pola listy zbierania (showProductImage / showEAN / …) są SSOT wyłącznie w API
 * ``wms/settings/picking-terminal`` → ``list_display``. localStorage trzyma tylko
 * pozostałe preferencje UI — nigdy nie seeduje ani nie nadpisuje tych sześciu pól.
 */

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
  showCourierBadge: boolean;

  shortageOrderStatusId: number | null;
  afterBatchCompleteAction: AfterBatchCompleteAction;
  separateDirectSalesOrders: boolean;
  allowPickInsidePackingMode: boolean;

  requireProductScanAtLeastOnce: boolean;
  requireLocationScan: boolean;
  disableForceLocationScanWhenManyLocations: boolean;
  allowReserveLocationPicking: boolean;
  allowProductsWithoutEan: boolean;
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
  showCourierBadge: true,

  shortageOrderStatusId: null,
  afterBatchCompleteAction: "stay_here",
  separateDirectSalesOrders: false,
  allowPickInsidePackingMode: false,

  requireProductScanAtLeastOnce: true,
  requireLocationScan: false,
  disableForceLocationScanWhenManyLocations: false,
  allowReserveLocationPicking: false,
  allowProductsWithoutEan: false,
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

const LIST_DISPLAY_CACHE_KEYS = [
  "showProductImage",
  "showEAN",
  "showSKU",
  "showCatalogNumber",
  "showStock",
  "showLocation",
] as const;

function omitListDisplayCacheFields(
  data: Partial<WmsPickingExtendedUiSettings>,
): Partial<WmsPickingExtendedUiSettings> {
  const next: Partial<WmsPickingExtendedUiSettings> = { ...data };
  for (const key of LIST_DISPLAY_CACHE_KEYS) {
    delete next[key];
  }
  return next;
}

export function loadWmsPickingExtendedUi(warehouseId: number): WmsPickingExtendedUiSettings {
  try {
    const raw = localStorage.getItem(storageKeyWmsPickingExtendedUi(warehouseId));
    if (!raw) return { ...DEFAULT_WMS_PICKING_EXTENDED_UI };
    const parsed = JSON.parse(raw) as Partial<WmsPickingExtendedUiSettings> & {
      allowProductsWithoutLabelsToBaskets?: boolean;
    };
    const migrated: Partial<WmsPickingExtendedUiSettings> = omitListDisplayCacheFields(parsed);
    if (migrated.allowProductsWithoutEan == null && parsed.allowProductsWithoutLabelsToBaskets != null) {
      migrated.allowProductsWithoutEan = Boolean(parsed.allowProductsWithoutLabelsToBaskets);
    }
    delete (migrated as { allowProductsWithoutLabelsToBaskets?: boolean }).allowProductsWithoutLabelsToBaskets;
    return { ...DEFAULT_WMS_PICKING_EXTENDED_UI, ...migrated };
  } catch {
    return { ...DEFAULT_WMS_PICKING_EXTENDED_UI };
  }
}

export function saveWmsPickingExtendedUi(warehouseId: number, data: WmsPickingExtendedUiSettings): void {
  try {
    const persisted = omitListDisplayCacheFields(data);
    localStorage.setItem(storageKeyWmsPickingExtendedUi(warehouseId), JSON.stringify(persisted));
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
