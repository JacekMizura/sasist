import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PICKING_DEAD_SHORTAGE_UI_CACHE_KEYS } from "../../../types/wmsPickingExtendedUi";
import {
  modeRequiresCartScan,
} from "../../../pages/wms/wmsPickingFlowResolve";

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe("Braki przy zbieraniu cleanup", () => {
  const panel = readFileSync(path.resolve(HERE, "./WmsPickingSettingsPanel.tsx"), "utf8");
  const shortageUi = readFileSync(path.resolve(HERE, "./pickingShortageSettings.tsx"), "utf8");
  const types = readFileSync(path.resolve(HERE, "../../../types/wmsPickingExtendedUi.ts"), "utf8");
  const catalog = readFileSync(
    path.resolve(HERE, "../../../pages/Settings/settingsSearch/catalog.ts"),
    "utf8",
  );
  const products = readFileSync(
    path.resolve(HERE, "../../../pages/wms/WmsPickingProductsPage.tsx"),
    "utf8",
  );
  const packingNotes = readFileSync(
    path.resolve(HERE, "../../../pages/Settings/packingSettings/PackingGeneralSection.tsx"),
    "utf8",
  );

  const scanIdx = panel.indexOf('id="wms-pick-scan"');
  const shortageIdx = panel.indexOf('id="wms-pick-shortage"');
  const automationIdx = panel.indexOf('id="wms-pick-automation"');
  const scanBlock = panel.slice(scanIdx, shortageIdx);
  const shortageBlock = panel.slice(shortageIdx, automationIdx);

  it("A) shortageOrderStatusId is gone from UI/type", () => {
    expect(types).not.toMatch(/shortageOrderStatusId:/);
    expect(panel).not.toContain("extended.shortageOrderStatusId");
    expect(panel).not.toContain("Preferencja lokalna");
    expect(shortageBlock).not.toContain("Status zamówienia z brakującymi produktami");
  });

  it("B) dead shortage UI keys exist only as omit list", () => {
    expect([...PICKING_DEAD_SHORTAGE_UI_CACHE_KEYS]).toEqual([
      "shortageOrderStatusId",
      "disableAutoDetachMissingOrdersFromCarts",
      "showAllNotes",
      "notesPopup",
      "showWarnings",
      "showMissingProductsHints",
    ]);
  });

  it("C/D/E) dead shortage API fields are not editable in UI", () => {
    expect(shortageUi).not.toContain("setAutoBraki");
    expect(shortageUi).not.toContain("Pokaż zamówienie w zakładce Braki");
    expect(shortageUi).not.toContain("Priorytet po rozwiązaniu problemu");
    expect(shortageUi).not.toContain("Natychmiast wróć do zbierania");
    expect(shortageUi).not.toContain("setPriority");
    expect(shortageUi).not.toContain("pokaż zamówienie ponownie w Zbieraniu");
    expect(shortageUi).not.toContain("setAutoReopen");
    expect(catalog).not.toContain("picking.show_in_braki_after_shortage");
  });

  it("F/G) notes subsection is gone; packing notes stay", () => {
    expect(panel).not.toContain("Notatki i ostrzeżenia (UI)");
    expect(types).not.toMatch(/showAllNotes:/);
    expect(types).not.toMatch(/notesPopup:/);
    expect(types).not.toMatch(/showWarnings:/);
    expect(types).not.toMatch(/showMissingProductsHints:/);
    expect(shortageBlock).not.toContain("Pokaż wszystkie notatki");
    expect(shortageBlock).not.toContain("Podpowiedzi braków");
    expect(packingNotes).toContain("showAllNotes");
  });

  it("H) live shortage status still GET/POST", () => {
    expect(shortageUi).toContain("shortage_reported_order_ui_status_id");
    expect(shortageUi).toContain("saveWmsPickingShortageSettings");
    expect(shortageUi).toContain("Status po zakończeniu zbierania z brakiem");
  });

  it("I) allow_continue still used by FE list", () => {
    expect(shortageUi).toContain("allow_continue_other_lines_after_shortage");
    expect(products).toContain("allowContinueAfterShortage");
    expect(products).toContain("blockOtherProductLines");
  });

  it("J) disable_auto_detach UI maps checked to the negative API flag", () => {
    expect(shortageUi).toContain("disable_auto_detach_missing_orders_from_carts");
    expect(shortageUi).toContain("Zostaw zamówienia z brakami na wózku");
    expect(shortageUi).toContain("setDisableAutoDetach");
  });

  it("K) recovery_completed status still saved", () => {
    expect(shortageUi).toContain("recovery_completed_order_ui_status_id");
    expect(shortageUi).toContain("Status po rozwiązaniu wszystkich braków");
  });

  it("L/M) validation block lives in Walidacja zbierania, not Braki", () => {
    expect(scanBlock).toContain("PickingPreAssignValidationFields");
    expect(scanBlock).toContain("Walidacja zbierania");
    expect(shortageBlock).not.toContain("PickingPreAssignValidationFields");
    expect(shortageBlock).not.toContain("Walidacja WMS");
    expect(shortageBlock).not.toContain("nie wejdzie do Capacity");
    expect(shortageUi).toContain("wms_validation_failed_order_ui_status_id");
    expect(shortageUi).toContain("Walidacja zamówienia przed przydziałem");
    expect(shortageUi).not.toContain("Capacity");
    expect(shortageUi).not.toContain("gate");
  });

  it("N) picking_config cart modes unchanged", () => {
    expect(modeRequiresCartScan("cart_no_scan")).toBe(false);
    expect(modeRequiresCartScan("cart_scan")).toBe(true);
    expect(modeRequiresCartScan("baskets")).toBe(true);
  });

  it("legacy picking_config.status_on_shortage_id is pass-through only", () => {
    expect(panel).not.toContain("Status po zgłoszeniu braku (WMS)");
    expect(panel).toContain("statusOnShortageId");
    expect(panel).toContain("row.status_on_shortage_id");
  });

  it("save echoes unused API fields instead of exposing them", () => {
    expect(shortageUi).toContain("legacyAutoEnqueueRef");
    expect(shortageUi).toContain("legacyPriorityRef");
    expect(shortageUi).toContain("legacyAutoReopenRef");
    expect(shortageUi).toContain("auto_enqueue_braki: legacyAutoEnqueueRef.current");
  });
});
