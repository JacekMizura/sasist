import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_WMS_PICKING_EXTENDED_UI } from "../../../types/wmsPickingExtendedUi";
import type { WmsPickingListDisplayApi } from "../../../api/wmsPickingTerminalSettingsApi";
import {
  applyListDisplayToExtendedUi,
  listDisplayForTerminalSave,
  listDisplayFromExtendedUi,
  PICKING_LIST_DISPLAY_HINTS,
  PICKING_LIST_DISPLAY_SECTION_HELP,
  pickingListCardVisibilityFromApi,
  stripListDisplayFromExtendedUi,
  withListDisplayPlaceholder,
} from "./pickingListDisplay";

const ALL_ON: WmsPickingListDisplayApi = {
  show_product_image: true,
  show_ean: true,
  show_sku: true,
  show_catalog_number: true,
  show_stock: true,
  show_location: true,
};

const HERE = path.dirname(fileURLToPath(import.meta.url));

const ALL_OFF: WmsPickingListDisplayApi = {
  show_product_image: false,
  show_ean: false,
  show_sku: false,
  show_catalog_number: false,
  show_stock: false,
  show_location: false,
};

describe("picking list_display SSOT", () => {
  it("A) GET all ON seeds the form regardless of stale cache OFF", () => {
    const fromCache = withListDisplayPlaceholder({
      ...DEFAULT_WMS_PICKING_EXTENDED_UI,
      showProductImage: false,
      showEAN: false,
      showSKU: false,
      showCatalogNumber: false,
      showStock: false,
      showLocation: false,
    });
    const seeded = applyListDisplayToExtendedUi(fromCache, ALL_ON);
    expect(listDisplayFromExtendedUi(seeded)).toEqual(ALL_ON);
  });

  it("B) localStorage OFF + API ON → UI ON", () => {
    const staleOff = applyListDisplayToExtendedUi(DEFAULT_WMS_PICKING_EXTENDED_UI, ALL_OFF);
    const ui = applyListDisplayToExtendedUi(staleOff, ALL_ON);
    expect(ui.showProductImage).toBe(true);
    expect(ui.showEAN).toBe(true);
    expect(ui.showSKU).toBe(true);
    expect(ui.showCatalogNumber).toBe(true);
    expect(ui.showStock).toBe(true);
    expect(ui.showLocation).toBe(true);
  });

  it("C) checkbox change maps to POST list_display", () => {
    const edited = {
      ...DEFAULT_WMS_PICKING_EXTENDED_UI,
      showProductImage: false,
      showCatalogNumber: true,
    };
    expect(
      listDisplayForTerminalSave({ hydratedFromApi: true, extended: edited }),
    ).toEqual({
      show_product_image: false,
      show_ean: true,
      show_sku: true,
      show_catalog_number: true,
      show_stock: true,
      show_location: true,
    });
  });

  it("D) GET fail → no list_display in POST (no cache overwrite)", () => {
    const stale = applyListDisplayToExtendedUi(DEFAULT_WMS_PICKING_EXTENDED_UI, ALL_OFF);
    expect(
      listDisplayForTerminalSave({ hydratedFromApi: false, extended: stale }),
    ).toBeUndefined();
  });

  it("E) list terminal mapper respects all six flags", () => {
    expect(pickingListCardVisibilityFromApi(ALL_ON)).toEqual({
      showProductImage: true,
      showEAN: true,
      showSKU: true,
      showCatalogNumber: true,
      showLocation: true,
      showWarehouseStock: true,
    });
    expect(pickingListCardVisibilityFromApi(ALL_OFF)).toEqual({
      showProductImage: false,
      showEAN: false,
      showSKU: false,
      showCatalogNumber: false,
      showLocation: false,
      showWarehouseStock: false,
    });
    const mixed: WmsPickingListDisplayApi = {
      ...ALL_ON,
      show_stock: false,
      show_location: true,
    };
    const vis = pickingListCardVisibilityFromApi(mixed);
    expect(vis.showWarehouseStock).toBe(false);
    expect(vis.showLocation).toBe(true);
    const productsPage = readFileSync(
      path.resolve(HERE, "../../../pages/wms/WmsPickingProductsPage.tsx"),
      "utf8",
    );
    expect(productsPage).toContain("pickingListCardVisibilityFromApi(listDisplay)");
  });

  it("F) detail view and qty panel do not consume list_display", () => {
    const detail = readFileSync(
      path.resolve(HERE, "../../../pages/wms/WmsPickingProductDetailPage.tsx"),
      "utf8",
    );
    const qty = readFileSync(
      path.resolve(HERE, "../../../components/wms/picking/PickingQtyPanel.tsx"),
      "utf8",
    );
    expect(detail).not.toMatch(/list_display/);
    expect(detail).not.toMatch(/show_product_image|show_catalog_number|showWarehouseStock/);
    expect(qty).not.toMatch(/list_display/);
    expect(qty).not.toMatch(/show_product_image|visibility\?/);
  });

  it("G) help copy uses the shared SettingInfoButton texts", () => {
    expect(PICKING_LIST_DISPLAY_SECTION_HELP.title).toBe("Lista zbierania");
    expect(PICKING_LIST_DISPLAY_SECTION_HELP.description).toContain(
      "Ustawienia nie wpływają na ekran realizacji produktu.",
    );
    expect(PICKING_LIST_DISPLAY_HINTS.showProductImage).toContain("miniaturę");
    expect(PICKING_LIST_DISPLAY_HINTS.showStock).toContain("łączny stan");
    expect(PICKING_LIST_DISPLAY_HINTS.showStock).toContain("Nie wpływa na ilość");
    const panel = readFileSync(path.resolve(HERE, "./WmsPickingSettingsPanel.tsx"), "utf8");
    expect(panel).toContain("PICKING_LIST_DISPLAY_SECTION_HELP");
    expect(panel).toContain("SettingInfoButton");
    expect(panel).toContain("PICKING_LIST_DISPLAY_HINTS.showProductImage");
    expect(panel).toContain("hint={PICKING_LIST_DISPLAY_HINTS.showStock}");
  });

  it("stripListDisplayFromExtendedUi drops only the six API fields", () => {
    const stripped = stripListDisplayFromExtendedUi({
      ...DEFAULT_WMS_PICKING_EXTENDED_UI,
      showCourierBadge: true,
    });
    expect(stripped).not.toHaveProperty("showProductImage");
    expect(stripped.showCourierBadge).toBe(true);
  });
});
