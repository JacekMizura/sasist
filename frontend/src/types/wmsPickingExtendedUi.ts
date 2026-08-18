/**
 * Rozszerzone ustawienia UI zbierania WMS.
 * Pola listy zbierania (showProductImage / showEAN / …) i akcja po zbiorze są SSOT w API
 * ``wms/settings/picking-terminal``. localStorage trzyma tylko pozostałe preferencje UI.
 */

export type WmsPickingExtendedUiSettings = {
  showProductImage: boolean;
  showEAN: boolean;
  showSKU: boolean;
  showCatalogNumber: boolean;
  showStock: boolean;
  showLocation: boolean;
  showCourierBadge: boolean;

  separateDirectSalesOrders: boolean;
  allowPickInsidePackingMode: boolean;

  requireProductScanAtLeastOnce: boolean;
  requireLocationScan: boolean;
  disableForceLocationScanWhenManyLocations: boolean;
  allowReserveLocationPicking: boolean;
  allowProductsWithoutEan: boolean;

  sortOrdersByCourier: boolean;
  prioritizeExpressOrders: boolean;

  autoStartNextOrder: boolean;
  autoOpenScanner: boolean;
  autoMarkPickedLines: boolean;
  autoMoveToPackingStatus: boolean;
  autoPrintTransferLabels: boolean;

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

  separateDirectSalesOrders: false,
  allowPickInsidePackingMode: false,

  requireProductScanAtLeastOnce: true,
  requireLocationScan: false,
  disableForceLocationScanWhenManyLocations: false,
  allowReserveLocationPicking: false,
  allowProductsWithoutEan: false,

  sortOrdersByCourier: false,
  prioritizeExpressOrders: true,

  autoStartNextOrder: false,
  autoOpenScanner: true,
  autoMarkPickedLines: false,
  autoMoveToPackingStatus: false,
  autoPrintTransferLabels: false,

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

/** Process settings that must never live in localStorage (API/DB is SSOT). */
const DEAD_QUEUE_CACHE_KEYS = [
  "afterBatchCompleteAction",
  "multiItemBatchOrdersCount",
  "singleItemBatchOrdersCount",
  "singleItemVolumeLimit",
  "batchManagementMode",
  "sortOrdersByAge",
] as const;

/** Dead „Metody zbierania” keys — SSOT is picking_config, never localStorage. */
const DEAD_METHODS_CACHE_KEYS = [
  "defaultPickingContainerType",
  "requireCartScanStart",
  "requireBasketScanStart",
  "autoSuggestCart",
  "autoSuggestRoute",
] as const;

/** Dead Braki / notes UI keys — SSOT is wms_picking_shortage_settings or packing notes. */
const DEAD_SHORTAGE_UI_CACHE_KEYS = [
  "shortageOrderStatusId",
  "disableAutoDetachMissingOrdersFromCarts",
  "showAllNotes",
  "notesPopup",
  "showWarnings",
  "showMissingProductsHints",
] as const;

/** Dead „Magazyny” keys — SSOT is WarehouseContext + warehouse-scoped picking runtime. */
const DEAD_WAREHOUSES_CACHE_KEYS = [
  "splitWorkBetweenWarehouses",
  "ignoreLocationStockLevels",
  "zonePickingEnabled",
  "mainPickingWarehouse",
  "fallbackWarehouse",
] as const;

function omitNonUiCacheFields(
  data: Partial<WmsPickingExtendedUiSettings> & Record<string, unknown>,
): Partial<WmsPickingExtendedUiSettings> {
  const next: Record<string, unknown> = { ...data };
  for (const key of LIST_DISPLAY_CACHE_KEYS) {
    delete next[key];
  }
  for (const key of DEAD_QUEUE_CACHE_KEYS) {
    delete next[key];
  }
  for (const key of DEAD_METHODS_CACHE_KEYS) {
    delete next[key];
  }
  for (const key of DEAD_SHORTAGE_UI_CACHE_KEYS) {
    delete next[key];
  }
  for (const key of DEAD_WAREHOUSES_CACHE_KEYS) {
    delete next[key];
  }
  return next;
}

export const PICKING_DEAD_QUEUE_CACHE_KEYS = DEAD_QUEUE_CACHE_KEYS;
export const PICKING_DEAD_METHODS_CACHE_KEYS = DEAD_METHODS_CACHE_KEYS;
export const PICKING_DEAD_SHORTAGE_UI_CACHE_KEYS = DEAD_SHORTAGE_UI_CACHE_KEYS;
export const PICKING_DEAD_WAREHOUSES_CACHE_KEYS = DEAD_WAREHOUSES_CACHE_KEYS;

export function loadWmsPickingExtendedUi(warehouseId: number): WmsPickingExtendedUiSettings {
  try {
    const raw = localStorage.getItem(storageKeyWmsPickingExtendedUi(warehouseId));
    if (!raw) return { ...DEFAULT_WMS_PICKING_EXTENDED_UI };
    const parsed = JSON.parse(raw) as Partial<WmsPickingExtendedUiSettings> & {
      allowProductsWithoutLabelsToBaskets?: boolean;
    };
    const migrated: Partial<WmsPickingExtendedUiSettings> = omitNonUiCacheFields(parsed);
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
    const persisted = omitNonUiCacheFields(data);
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
