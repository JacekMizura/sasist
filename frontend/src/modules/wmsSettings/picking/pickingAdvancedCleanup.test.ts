import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WMS_PICKING_SETTINGS_NAV_SECTIONS } from "./pickingSettingsNavSections";
import { PICKING_DEAD_ADVANCED_CACHE_KEYS } from "../../../types/wmsPickingExtendedUi";
import { sortWmsPickingProductLinesPickFlow } from "../../../pages/wms/wmsPickingUiGates";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const DEAD_ADVANCED_KEYS = [
  "supplierAvailabilityCheck",
  "legacyMode",
  "debugMode",
  "advancedRoutingMode",
] as const;

describe("Zaawansowane przy zbieraniu cleanup", () => {
  const panel = readFileSync(path.resolve(HERE, "./WmsPickingSettingsPanel.tsx"), "utf8");
  const nav = readFileSync(path.resolve(HERE, "./pickingSettingsNavSections.ts"), "utf8");
  const navUi = readFileSync(path.resolve(HERE, "./PickingSettingsSectionNav.tsx"), "utf8");
  const catalog = readFileSync(
    path.resolve(HERE, "../../../pages/Settings/settingsSearch/catalog.ts"),
    "utf8",
  );
  const types = readFileSync(path.resolve(HERE, "../../../types/wmsPickingExtendedUi.ts"), "utf8");
  const products = readFileSync(
    path.resolve(HERE, "../../../pages/wms/WmsPickingProductsPage.tsx"),
    "utf8",
  );
  const atp = readFileSync(path.resolve(HERE, "../../../../../backend/services/wms_picking_atp.py"), "utf8");
  const lifecycle = readFileSync(
    path.resolve(HERE, "../../../../../backend/services/cart_picking_lifecycle_service.py"),
    "utf8",
  );
  const assignment = readFileSync(
    path.resolve(HERE, "../../../../../backend/services/picking_assignment_service.py"),
    "utf8",
  );
  const graph = readFileSync(
    path.resolve(HERE, "../../../../../backend/services/warehouse_routing/runtime_graph_reader.py"),
    "utf8",
  );
  const pickingList = readFileSync(
    path.resolve(HERE, "../../../../../backend/services/wms_picking_product_list_service.py"),
    "utf8",
  );
  const routing = readFileSync(
    path.resolve(HERE, "../../../../../backend/services/picking_routing_service.py"),
    "utf8",
  );
  const supplierProduct = readFileSync(
    path.resolve(HERE, "../../../../../backend/models/supplier_product.py"),
    "utf8",
  );
  const terminalSchema = readFileSync(
    path.resolve(HERE, "../../../../../backend/schemas/wms_picking_terminal_settings.py"),
    "utf8",
  );

  it("A) section Zaawansowane is gone from menu", () => {
    expect(WMS_PICKING_SETTINGS_NAV_SECTIONS.some((s) => s.id === "wms-pick-advanced")).toBe(false);
    expect(WMS_PICKING_SETTINGS_NAV_SECTIONS.some((s) => s.label === "Zaawansowane")).toBe(false);
    expect(nav).not.toContain("wms-pick-advanced");
    expect(navUi).not.toContain("wms-pick-advanced");
  });

  it("B) panel has no empty Zaawansowane card and no dead fields", () => {
    expect(panel).not.toContain('id="wms-pick-advanced"');
    expect(panel).not.toContain('title="Zaawansowane"');
    expect(panel).not.toContain("Korzystaj z dostępności produktów u dostawców");
    expect(panel).not.toContain("Tryb legacy");
    expect(panel).not.toContain("Tryb debug");
    expect(panel).not.toContain("Zaawansowany routing");
  });

  it("C) search has no picking.debug_mode entry", () => {
    expect(catalog).not.toContain("picking.debug_mode");
    expect(catalog).not.toContain("wms-pick-advanced");
  });

  it("D/L) four keys are gone from the live type and form", () => {
    for (const key of DEAD_ADVANCED_KEYS) {
      expect(types).not.toMatch(new RegExp(`${key}:`));
      expect(panel).not.toContain(`extended.${key}`);
      expect(panel).not.toContain(`patchExtended("${key}"`);
      expect(products).not.toContain(key);
    }
  });

  it("E) dead Zaawansowane keys exist only as omit list", () => {
    expect([...PICKING_DEAD_ADVANCED_CACHE_KEYS]).toEqual([...DEAD_ADVANCED_KEYS]);
    expect(types).toContain("DEAD_ADVANCED_CACHE_KEYS");
  });

  it("F) ATP still uses Inventory, not supplier availability", () => {
    expect(atp).toContain("Inventory.warehouse_id == int(warehouse_id)");
    expect(atp).toContain("Inventory.quantity > 0");
    expect(atp).not.toContain("supplierAvailabilityCheck");
    expect(atp).not.toContain("SupplierProduct");
    expect(terminalSchema).not.toContain("supplier_availability");
    expect(terminalSchema).not.toContain("legacy_mode");
    expect(terminalSchema).not.toContain("debug_mode");
    expect(terminalSchema).not.toContain("advanced_routing");
  });

  it("G) cart lifecycle start_picking is unchanged", () => {
    expect(lifecycle).toContain("def start_picking(");
    expect(lifecycle).not.toContain("legacyMode");
    expect(lifecycle).not.toContain("supplierAvailabilityCheck");
  });

  it("H) legacy assign remains forbidden", () => {
    expect(assignment).toContain('code="legacy_assign_forbidden"');
    expect(assignment).toContain("LEGACY WYŁĄCZONE");
    expect(assignment).not.toContain("legacyMode");
  });

  it("I) Runtime Graph still orders pick locations", () => {
    expect(graph).toContain("def order_location_ids_by_graph");
    expect(graph).toContain("def visit_index_map");
    expect(pickingList).toContain("visit_index_map");
    expect(pickingList).toContain("route_sort_key");
    expect(routing).toContain("warehouse_routing.runtime_graph_reader");
    expect(graph).not.toContain("advancedRoutingMode");
  });

  it("J) graph-unavailable fallback stays location_id sort", () => {
    expect(graph).toContain("return sorted(uniq), ERROR_ROUTING_GRAPH_NOT_CONFIGURED");
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

  it("K) SupplierProduct purchasing catalog is untouched", () => {
    expect(supplierProduct).toContain("class SupplierProduct");
    expect(supplierProduct).toContain("lead_time_days");
    expect(supplierProduct).toContain("purchase_price");
    expect(panel).not.toContain("SupplierProduct");
    expect(pickingList).not.toContain("SupplierProduct");
  });
});
