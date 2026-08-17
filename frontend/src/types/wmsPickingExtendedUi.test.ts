import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_WMS_PICKING_LIST_DISPLAY } from "../api/wmsPickingTerminalSettingsApi";
import { PICKING_LIST_DISPLAY_UI_KEYS } from "../modules/wmsSettings/picking/pickingListDisplay";
import {
  DEFAULT_WMS_PICKING_EXTENDED_UI,
  loadWmsPickingExtendedUi,
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
        autoOpenScanner: false,
      }),
    );
    const loaded = loadWmsPickingExtendedUi(WH);
    expect(loaded.showProductImage).toBe(DEFAULT_WMS_PICKING_LIST_DISPLAY.show_product_image);
    expect(loaded.showEAN).toBe(DEFAULT_WMS_PICKING_LIST_DISPLAY.show_ean);
    expect(loaded.showSKU).toBe(DEFAULT_WMS_PICKING_LIST_DISPLAY.show_sku);
    expect(loaded.showCatalogNumber).toBe(DEFAULT_WMS_PICKING_LIST_DISPLAY.show_catalog_number);
    expect(loaded.showStock).toBe(DEFAULT_WMS_PICKING_LIST_DISPLAY.show_stock);
    expect(loaded.showLocation).toBe(DEFAULT_WMS_PICKING_LIST_DISPLAY.show_location);
    expect(loaded.autoOpenScanner).toBe(false);
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
});
