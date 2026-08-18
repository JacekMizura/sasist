import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_WMS_PICKING_LIST_DISPLAY } from "../api/wmsPickingTerminalSettingsApi";
import { PICKING_LIST_DISPLAY_UI_KEYS } from "../modules/wmsSettings/picking/pickingListDisplay";
import {
  DEFAULT_WMS_PICKING_EXTENDED_UI,
  loadWmsPickingExtendedUi,
  PICKING_DEAD_AUTOMATION_CACHE_KEYS,
  PICKING_DEAD_METHODS_CACHE_KEYS,
  PICKING_DEAD_QUEUE_CACHE_KEYS,
  PICKING_DEAD_SHORTAGE_UI_CACHE_KEYS,
  PICKING_DEAD_WAREHOUSES_CACHE_KEYS,
  saveWmsPickingExtendedUi,
  storageKeyWmsPickingExtendedUi,
} from "./wmsPickingExtendedUi";

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const api = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: api, configurable: true });
}

const WH = 7;

describe("wms-picking-extended-ui localStorage vs list_display", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it("ignores stale OFF list_display keys in cache (API placeholder until GET)", () => {
    localStorage.setItem(
      storageKeyWmsPickingExtendedUi(WH),
      JSON.stringify({
        ...DEFAULT_WMS_PICKING_EXTENDED_UI,
        showProductImage: false,
        showEAN: false,
        showSKU: false,
        showCatalogNumber: false,
        showStock: false,
        showLocation: false,
        debugMode: true,
      }),
    );
    const loaded = loadWmsPickingExtendedUi(WH);
    expect(loaded.showProductImage).toBe(DEFAULT_WMS_PICKING_LIST_DISPLAY.show_product_image);
    expect(loaded.showEAN).toBe(DEFAULT_WMS_PICKING_LIST_DISPLAY.show_ean);
    expect(loaded.showSKU).toBe(DEFAULT_WMS_PICKING_LIST_DISPLAY.show_sku);
    expect(loaded.showCatalogNumber).toBe(DEFAULT_WMS_PICKING_LIST_DISPLAY.show_catalog_number);
    expect(loaded.showStock).toBe(DEFAULT_WMS_PICKING_LIST_DISPLAY.show_stock);
    expect(loaded.showLocation).toBe(DEFAULT_WMS_PICKING_LIST_DISPLAY.show_location);
    expect(loaded.debugMode).toBe(true);
  });

  it("does not persist the six list_display fields", () => {
    saveWmsPickingExtendedUi(WH, {
      ...DEFAULT_WMS_PICKING_EXTENDED_UI,
      showProductImage: false,
      showEAN: false,
      showSKU: false,
      showCatalogNumber: true,
      showStock: false,
      showLocation: false,
      debugMode: true,
    });
    const raw = JSON.parse(localStorage.getItem(storageKeyWmsPickingExtendedUi(WH)) ?? "{}") as Record<
      string,
      unknown
    >;
    for (const key of PICKING_LIST_DISPLAY_UI_KEYS) {
      expect(raw).not.toHaveProperty(key);
    }
    expect(raw.debugMode).toBe(true);
  });

  it("strips dead Lista zleceń queue keys from cache and defaults", () => {
    localStorage.setItem(
      storageKeyWmsPickingExtendedUi(WH),
      JSON.stringify({
        ...DEFAULT_WMS_PICKING_EXTENDED_UI,
        afterBatchCompleteAction: "stay_here",
        multiItemBatchOrdersCount: 12,
        singleItemBatchOrdersCount: 8,
        singleItemVolumeLimit: 40,
        batchManagementMode: "full_auto",
        sortOrdersByAge: true,
        debugMode: true,
      }),
    );
    const loaded = loadWmsPickingExtendedUi(WH);
    expect(loaded).not.toHaveProperty("afterBatchCompleteAction");
    expect(loaded).not.toHaveProperty("multiItemBatchOrdersCount");
    expect(loaded).not.toHaveProperty("singleItemBatchOrdersCount");
    expect(loaded).not.toHaveProperty("singleItemVolumeLimit");
    expect(loaded).not.toHaveProperty("batchManagementMode");
    expect(loaded).not.toHaveProperty("sortOrdersByAge");
    expect(loaded.debugMode).toBe(true);

    saveWmsPickingExtendedUi(WH, loaded);
    const raw = JSON.parse(localStorage.getItem(storageKeyWmsPickingExtendedUi(WH)) ?? "{}") as Record<
      string,
      unknown
    >;
    for (const key of PICKING_DEAD_QUEUE_CACHE_KEYS) {
      expect(raw).not.toHaveProperty(key);
    }
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("afterBatchCompleteAction");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("multiItemBatchOrdersCount");
  });

  it("strips dead Metody zbierania keys from cache and defaults", () => {
    localStorage.setItem(
      storageKeyWmsPickingExtendedUi(WH),
      JSON.stringify({
        ...DEFAULT_WMS_PICKING_EXTENDED_UI,
        defaultPickingContainerType: "cart",
        requireCartScanStart: true,
        requireBasketScanStart: true,
        autoSuggestCart: false,
        autoSuggestRoute: true,
        debugMode: true,
      }),
    );
    const loaded = loadWmsPickingExtendedUi(WH);
    for (const key of PICKING_DEAD_METHODS_CACHE_KEYS) {
      expect(loaded).not.toHaveProperty(key);
    }
    expect(loaded.debugMode).toBe(true);

    saveWmsPickingExtendedUi(WH, loaded);
    const raw = JSON.parse(localStorage.getItem(storageKeyWmsPickingExtendedUi(WH)) ?? "{}") as Record<
      string,
      unknown
    >;
    for (const key of PICKING_DEAD_METHODS_CACHE_KEYS) {
      expect(raw).not.toHaveProperty(key);
    }
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("defaultPickingContainerType");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("autoSuggestCart");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("autoSuggestRoute");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("requireCartScanStart");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("requireBasketScanStart");
  });

  it("strips dead Braki / notes keys from cache and defaults", () => {
    localStorage.setItem(
      storageKeyWmsPickingExtendedUi(WH),
      JSON.stringify({
        ...DEFAULT_WMS_PICKING_EXTENDED_UI,
        shortageOrderStatusId: 44,
        disableAutoDetachMissingOrdersFromCarts: true,
        showAllNotes: false,
        notesPopup: true,
        showWarnings: false,
        showMissingProductsHints: false,
        debugMode: true,
      }),
    );
    const loaded = loadWmsPickingExtendedUi(WH);
    for (const key of PICKING_DEAD_SHORTAGE_UI_CACHE_KEYS) {
      expect(loaded).not.toHaveProperty(key);
    }
    expect(loaded.debugMode).toBe(true);

    saveWmsPickingExtendedUi(WH, loaded);
    const raw = JSON.parse(localStorage.getItem(storageKeyWmsPickingExtendedUi(WH)) ?? "{}") as Record<
      string,
      unknown
    >;
    for (const key of PICKING_DEAD_SHORTAGE_UI_CACHE_KEYS) {
      expect(raw).not.toHaveProperty(key);
    }
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("shortageOrderStatusId");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("showAllNotes");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("notesPopup");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("showWarnings");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("showMissingProductsHints");
  });

  it("strips dead Magazyny keys from cache and defaults", () => {
    localStorage.setItem(
      storageKeyWmsPickingExtendedUi(WH),
      JSON.stringify({
        ...DEFAULT_WMS_PICKING_EXTENDED_UI,
        splitWorkBetweenWarehouses: true,
        ignoreLocationStockLevels: true,
        zonePickingEnabled: true,
        mainPickingWarehouse: "WH-1",
        fallbackWarehouse: "WH-2",
        debugMode: true,
      }),
    );
    const loaded = loadWmsPickingExtendedUi(WH);
    for (const key of PICKING_DEAD_WAREHOUSES_CACHE_KEYS) {
      expect(loaded).not.toHaveProperty(key);
    }
    expect(loaded.debugMode).toBe(true);

    saveWmsPickingExtendedUi(WH, loaded);
    const raw = JSON.parse(localStorage.getItem(storageKeyWmsPickingExtendedUi(WH)) ?? "{}") as Record<
      string,
      unknown
    >;
    for (const key of PICKING_DEAD_WAREHOUSES_CACHE_KEYS) {
      expect(raw).not.toHaveProperty(key);
    }
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("splitWorkBetweenWarehouses");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("ignoreLocationStockLevels");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("zonePickingEnabled");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("mainPickingWarehouse");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("fallbackWarehouse");
  });

  it("strips dead Automatyzacja keys from cache and defaults", () => {
    localStorage.setItem(
      storageKeyWmsPickingExtendedUi(WH),
      JSON.stringify({
        ...DEFAULT_WMS_PICKING_EXTENDED_UI,
        autoStartNextOrder: true,
        autoOpenScanner: false,
        autoMarkPickedLines: true,
        autoMoveToPackingStatus: true,
        autoPrintTransferLabels: true,
        debugMode: true,
      }),
    );
    const loaded = loadWmsPickingExtendedUi(WH);
    for (const key of PICKING_DEAD_AUTOMATION_CACHE_KEYS) {
      expect(loaded).not.toHaveProperty(key);
    }
    expect(loaded.debugMode).toBe(true);

    saveWmsPickingExtendedUi(WH, loaded);
    const raw = JSON.parse(localStorage.getItem(storageKeyWmsPickingExtendedUi(WH)) ?? "{}") as Record<
      string,
      unknown
    >;
    for (const key of PICKING_DEAD_AUTOMATION_CACHE_KEYS) {
      expect(raw).not.toHaveProperty(key);
    }
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("autoStartNextOrder");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("autoOpenScanner");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("autoMarkPickedLines");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("autoMoveToPackingStatus");
    expect(DEFAULT_WMS_PICKING_EXTENDED_UI).not.toHaveProperty("autoPrintTransferLabels");
  });
});
