import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WMS_PICKING_SETTINGS_NAV_SECTIONS } from "./pickingSettingsNavSections";
import { PICKING_DEAD_WAREHOUSES_CACHE_KEYS } from "../../../types/wmsPickingExtendedUi";
import {
  modeRequiresCartScan,
  needsCartAfterOrderTypeChoice,
  resolveAfterOrderTypeChoice,
} from "../../../pages/wms/wmsPickingFlowResolve";
import type { WmsPickingSessionState } from "../../../pages/wms/wmsPickingFlowTypes";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";
import { sortWmsPickingProductLinesPickFlow } from "../../../pages/wms/wmsPickingUiGates";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const DEAD_WAREHOUSE_KEYS = [
  "splitWorkBetweenWarehouses",
  "ignoreLocationStockLevels",
  "zonePickingEnabled",
  "mainPickingWarehouse",
  "fallbackWarehouse",
] as const;

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

describe("Magazyny przy zbieraniu cleanup", () => {
  const panel = readFileSync(path.resolve(HERE, "./WmsPickingSettingsPanel.tsx"), "utf8");
  const nav = readFileSync(path.resolve(HERE, "./pickingSettingsNavSections.ts"), "utf8");
  const navUi = readFileSync(path.resolve(HERE, "./PickingSettingsSectionNav.tsx"), "utf8");
  const catalog = readFileSync(
    path.resolve(HERE, "../../../pages/Settings/settingsSearch/catalog.ts"),
    "utf8",
  );
  const types = readFileSync(path.resolve(HERE, "../../../types/wmsPickingExtendedUi.ts"), "utf8");
  const pickingConfig = readFileSync(
    path.resolve(HERE, "../../../../../backend/models/picking_config.py"),
    "utf8",
  );
  const atp = readFileSync(path.resolve(HERE, "../../../../../backend/services/wms_picking_atp.py"), "utf8");
  const pickingZone = readFileSync(
    path.resolve(HERE, "../../../../../backend/models/picking_zone.py"),
    "utf8",
  );
  const fulfillment = readFileSync(
    path.resolve(HERE, "../../../../../backend/services/fulfillment_assignment/constants.py"),
    "utf8",
  );

  it("A) section Magazyny is gone from menu", () => {
    expect(WMS_PICKING_SETTINGS_NAV_SECTIONS.some((s) => s.id === "wms-pick-warehouses")).toBe(false);
    expect(WMS_PICKING_SETTINGS_NAV_SECTIONS.some((s) => s.label === "Magazyny")).toBe(false);
    expect(nav).not.toContain("wms-pick-warehouses");
    expect(navUi).not.toContain("wms-pick-warehouses");
  });

  it("B) panel has no empty Magazyny card and no dead fields", () => {
    expect(panel).not.toContain('id="wms-pick-warehouses"');
    expect(panel).not.toContain('title="Magazyny"');
    expect(panel).not.toContain("Rozdziel pracę między magazynami");
    expect(panel).not.toContain("Ignoruj stany magazynowe lokalizacji");
    expect(panel).not.toContain("Zbieranie strefowe");
    expect(panel).not.toContain("Główny magazyn zbierania");
    expect(panel).not.toContain("Magazyn zapasowy");
    expect(catalog).not.toContain("picking.split_work_between_warehouses");
    expect(catalog).not.toContain("wms-pick-warehouses");
  });

  it("C/L) five keys are gone from the live type", () => {
    for (const key of DEAD_WAREHOUSE_KEYS) {
      expect(types).not.toMatch(new RegExp(`${key}:`));
      expect(panel).not.toContain(`extended.${key}`);
      expect(panel).not.toContain(`patchExtended("${key}"`);
    }
  });

  it("D) dead Magazyny keys exist only as omit list", () => {
    expect([...PICKING_DEAD_WAREHOUSES_CACHE_KEYS]).toEqual([...DEAD_WAREHOUSE_KEYS]);
  });

  it("F) picking_config stays per warehouse", () => {
    expect(pickingConfig).toContain("uq_picking_config_tenant_wh_source_status");
    expect(pickingConfig).toContain('"warehouse_id"');
  });

  it("G/H) cartless and cart_scan/baskets start flow unchanged", () => {
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

  it("J) ATP remains warehouse-scoped with no ignore-stock bypass", () => {
    expect(atp).toContain("Inventory.warehouse_id == int(warehouse_id)");
    expect(atp).toContain("Inventory.quantity > 0");
    expect(atp).not.toContain("ignoreLocationStockLevels");
    expect(atp).not.toContain("ignore_location_stock");
  });

  it("K) product list still sorts by route_sort_key", () => {
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

  it("does not bind dead keys to PickingZone or fulfillment assignment", () => {
    expect(panel).not.toContain("PickingZone");
    expect(panel).not.toContain("fulfillment_assignment");
    expect(pickingZone).toContain("class PickingZone");
    expect(fulfillment).toContain("FULFILLMENT_ASSIGNMENT_DEFAULT_WAREHOUSE");
    expect(fulfillment).toContain("FULFILLMENT_ASSIGNMENT_AUTO_ATP_FUTURE");
  });
});
