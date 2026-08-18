import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WMS_PICKING_SETTINGS_NAV_SECTIONS } from "./pickingSettingsNavSections";
import { PICKING_DEAD_AUTOMATION_CACHE_KEYS } from "../../../types/wmsPickingExtendedUi";
import {
  resolveAfterBatchComplete,
} from "../../../pages/wms/wmsPickingFlowResolve";
import type { WmsPickingSessionState } from "../../../pages/wms/wmsPickingFlowTypes";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const DEAD_AUTOMATION_KEYS = [
  "autoStartNextOrder",
  "autoOpenScanner",
  "autoMarkPickedLines",
  "autoMoveToPackingStatus",
  "autoPrintTransferLabels",
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

describe("Automatyzacja przy zbieraniu cleanup", () => {
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
  const detail = readFileSync(
    path.resolve(HERE, "../../../pages/wms/WmsPickingProductDetailPage.tsx"),
    "utf8",
  );
  const packingAutomation = readFileSync(
    path.resolve(HERE, "../../../pages/Settings/packingSettings/PackingAutomationSection.tsx"),
    "utf8",
  );
  const pickingList = readFileSync(
    path.resolve(HERE, "../../../../../backend/services/wms_picking_product_list_service.py"),
    "utf8",
  );
  const packingService = readFileSync(
    path.resolve(HERE, "../../../../../backend/services/wms_packing_service.py"),
    "utf8",
  );
  const pickingConfig = readFileSync(
    path.resolve(HERE, "../../../../../backend/models/picking_config.py"),
    "utf8",
  );

  it("A) section Automatyzacja is gone from menu", () => {
    expect(WMS_PICKING_SETTINGS_NAV_SECTIONS.some((s) => s.id === "wms-pick-automation")).toBe(false);
    expect(WMS_PICKING_SETTINGS_NAV_SECTIONS.some((s) => s.label === "Automatyzacja")).toBe(false);
    expect(nav).not.toContain("wms-pick-automation");
    expect(navUi).not.toContain("wms-pick-automation");
  });

  it("B) panel has no empty Automatyzacja card and no dead fields", () => {
    expect(panel).not.toContain('id="wms-pick-automation"');
    expect(panel).not.toContain('title="Automatyzacja"');
    expect(panel).not.toContain("Auto: następne zamówienie");
    expect(panel).not.toContain("Auto: otwórz skaner");
    expect(panel).not.toContain("Auto: oznaczaj zebrane linie");
    expect(panel).not.toContain("Auto: przejdź do statusu pakowania");
    expect(panel).not.toContain("Auto: druk etykiet przesunięć");
  });

  it("C) search has no picking.auto_start_next_order entry", () => {
    expect(catalog).not.toContain("picking.auto_start_next_order");
    expect(catalog).not.toContain("wms-pick-automation");
  });

  it("D/L) five keys are gone from the live type and form", () => {
    for (const key of DEAD_AUTOMATION_KEYS) {
      expect(types).not.toMatch(new RegExp(`${key}:`));
      expect(panel).not.toContain(`extended.${key}`);
      expect(panel).not.toContain(`patchExtended("${key}"`);
      expect(products).not.toContain(key);
      expect(detail).not.toContain(key);
    }
  });

  it("E) dead Automatyzacja keys exist only as omit list", () => {
    expect([...PICKING_DEAD_AUTOMATION_CACHE_KEYS]).toEqual([...DEAD_AUTOMATION_KEYS]);
    expect(types).toContain("DEAD_AUTOMATION_CACHE_KEYS");
  });

  it("F) after_batch_complete_action still assigns the next batch", () => {
    expect(products).toContain("after_batch_complete_action");
    expect(products).toContain("resolveAfterBatchComplete");
    expect(products).not.toContain("loadWmsPickingExtendedUi");
    const cartless = { ...baseSession(), singleMode: "cart_no_scan" as const, multiMode: "cart_no_scan" as const };
    const next = resolveAfterBatchComplete({
      action: "assign_new_batch",
      session: cartless,
      orderType: "single",
    });
    expect(next.kind).toBe("navigate");
    if (next.kind !== "navigate") return;
    expect(next.path).toBe(WMS_ROUTES.pickingProducts);
    expect(next.state.afterBatchAssign).toBe(true);
    const back = resolveAfterBatchComplete({
      action: "back_to_list",
      session: baseSession(),
      orderType: "single",
    });
    expect(back.kind).toBe("navigate");
    if (back.kind !== "navigate") return;
    expect(back.path).toBe(WMS_ROUTES.pickingOrderType);
  });

  it("G) scanner still comes from useWmsScanner + picking-terminal policy", () => {
    expect(products).toContain("useWmsScanner");
    expect(detail).toContain("useWmsScanner");
    expect(detail).toContain("require_product_scan_at_least_once");
    expect(detail).toContain("require_location_scan");
    expect(products).toContain("require_product_scan_at_least_once");
  });

  it("H) lines still complete from remaining qty, not a UI toggle", () => {
    expect(pickingList).toContain("def _picking_line_resolution_status");
    expect(pickingList).toContain("def _picking_product_line_completed");
    expect(pickingList).toContain("remaining_to_pick");
    expect(pickingList).toContain("COMPLETED_PICK");
    expect(pickingList).not.toContain("autoMarkPickedLines");
    expect(pickingList).not.toContain("auto_mark_picked_lines");
  });

  it("I) target_status_id still drives status after picking", () => {
    expect(pickingConfig).toContain("target_status_id");
    expect(pickingList).toContain("def _panel_status_after_picking_finalize");
    expect(pickingList).toContain("return int(pc.target_status_id)");
    expect(pickingList).not.toContain("autoMoveToPackingStatus");
  });

  it("J) packing qualification still unions picking target + packing start statuses", () => {
    expect(packingService).toContain("def list_packing_target_statuses");
    expect(packingService).toContain("picking_config.target_status_id");
    expect(packingService).toContain("start_status_id");
    expect(packingService).toContain("allowed_start_status_ids");
  });

  it("K) packing print automation stays; picking has no transfer-label trigger", () => {
    expect(packingAutomation).toContain("packing.auto_print_label");
    expect(packingAutomation).toContain("packing.auto_print_document");
    expect(panel).not.toContain("autoPrintTransferLabels");
    expect(pickingList).not.toContain("autoPrintTransferLabels");
    expect(pickingList).not.toContain("auto_print_transfer");
  });
});
