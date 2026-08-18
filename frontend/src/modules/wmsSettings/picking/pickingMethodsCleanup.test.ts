import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WMS_PICKING_SETTINGS_NAV_SECTIONS } from "./pickingSettingsNavSections";
import { PICKING_DEAD_METHODS_CACHE_KEYS } from "../../../types/wmsPickingExtendedUi";
import {
  modeRequiresCartScan,
  needsCartAfterOrderTypeChoice,
  resolveAfterOrderTypeChoice,
} from "../../../pages/wms/wmsPickingFlowResolve";
import type { WmsPickingSessionState } from "../../../pages/wms/wmsPickingFlowTypes";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";
import { sortWmsPickingProductLinesPickFlow } from "../../../pages/wms/wmsPickingUiGates";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const baseSession = (): WmsPickingSessionState => ({
  orderUiStatusId: 6,
  orderUiStatusName: "Wózki",
  orderUiStatusColor: "#3366ff",
  mainGroup: "IN_PROGRESS",
  singleMode: "cart_scan",
  multiMode: "baskets",
  allMode: "cart_scan",
  allOrderSort: "location",
});

describe("Metody zbierania cleanup", () => {
  const panel = readFileSync(path.resolve(HERE, "./WmsPickingSettingsPanel.tsx"), "utf8");
  const nav = readFileSync(path.resolve(HERE, "./pickingSettingsNavSections.ts"), "utf8");
  const catalog = readFileSync(
    path.resolve(HERE, "../../../pages/Settings/settingsSearch/catalog.ts"),
    "utf8",
  );
  const types = readFileSync(path.resolve(HERE, "../../../types/wmsPickingExtendedUi.ts"), "utf8");

  it("A) section Metody zbierania is gone from nav", () => {
    expect(WMS_PICKING_SETTINGS_NAV_SECTIONS.some((s) => s.id === "wms-pick-carts")).toBe(false);
    expect(WMS_PICKING_SETTINGS_NAV_SECTIONS.some((s) => s.label === "Metody zbierania")).toBe(false);
    expect(nav).not.toContain("wms-pick-carts");
    expect(nav).not.toContain("Metody zbierania");
  });

  it("B) panel has no empty Metody zbierania card", () => {
    expect(panel).not.toContain("Metody zbierania");
    expect(panel).not.toContain('id="wms-pick-carts"');
    expect(panel).not.toContain("Domyślny typ kontenera");
    expect(panel).not.toContain("Wymagaj skanu wózka na start");
    expect(panel).not.toContain("Wymagaj skanu koszyka na start");
    expect(panel).not.toContain("Auto-sugestia wózka");
    expect(panel).not.toContain("Auto-sugestia trasy");
    expect(catalog).not.toContain("picking.default_container_type");
    expect(catalog).not.toContain("wms-pick-carts");
  });

  it("C/J) type has no live fields; keys exist only as omit list", () => {
    expect(types).not.toContain("export type DefaultPickingContainerType");
    expect(types).not.toMatch(/defaultPickingContainerType:/);
    expect(types).not.toMatch(/requireCartScanStart:/);
    expect(types).not.toMatch(/requireBasketScanStart:/);
    expect(types).not.toMatch(/autoSuggestCart:/);
    expect(types).not.toMatch(/autoSuggestRoute:/);
    expect([...PICKING_DEAD_METHODS_CACHE_KEYS]).toEqual([
      "defaultPickingContainerType",
      "requireCartScanStart",
      "requireBasketScanStart",
      "autoSuggestCart",
      "autoSuggestRoute",
    ]);
  });

  it("E–H) picking_config start flow unchanged", () => {
    expect(modeRequiresCartScan("cart_no_scan")).toBe(false);
    expect(modeRequiresCartScan("cart_scan")).toBe(true);
    expect(modeRequiresCartScan("baskets")).toBe(true);
    const s = baseSession();
    const cartless = resolveAfterOrderTypeChoice(
      { ...s, singleMode: "cart_no_scan", multiMode: "cart_no_scan" },
      "multi",
    );
    expect(cartless.path).toBe(WMS_ROUTES.pickingProducts);
    expect(cartless.state.pickingSession.requireCart).toBe(false);
    const scanned = resolveAfterOrderTypeChoice(s, "single");
    expect(scanned.path).toBe(WMS_ROUTES.pickingCart);
    expect(scanned.state.pickingSession.cartType).toBe("BULK");
    const baskets = resolveAfterOrderTypeChoice(s, "multi");
    expect(baskets.path).toBe(WMS_ROUTES.pickingCart);
    expect(baskets.state.pickingSession.cartType).toBe("BASKETS");
    expect(needsCartAfterOrderTypeChoice("cart_scan", "baskets", "multi", "baskets")).toBe(true);
  });

  it("I) product list still sorts by route_sort_key", () => {
    const sorted = sortWmsPickingProductLinesPickFlow([
      {
        product_id: 2,
        product_name: "B",
        total_quantity: 1,
        picked_quantity: 0,
        remaining_to_pick: 1,
        route_sort_key: "020",
      } as never,
      {
        product_id: 1,
        product_name: "A",
        total_quantity: 1,
        picked_quantity: 0,
        remaining_to_pick: 1,
        route_sort_key: "010",
      } as never,
    ]);
    expect(sorted.map((r) => r.product_id)).toEqual([1, 2]);
  });
});
