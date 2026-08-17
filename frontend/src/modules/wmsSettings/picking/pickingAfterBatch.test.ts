import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_BATCH_COMPLETE_ACTION, normalizeAfterBatchCompleteAction } from "../../../api/wmsPickingTerminalSettingsApi";
import { PICKING_AFTER_BATCH_SECTION_HELP } from "./pickingAfterBatchHelp";

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe("Lista zleceń after-batch cleanup", () => {
  const panel = readFileSync(path.resolve(HERE, "./WmsPickingSettingsPanel.tsx"), "utf8");
  const products = readFileSync(
    path.resolve(HERE, "../../../pages/wms/WmsPickingProductsPage.tsx"),
    "utf8",
  );
  const cartScan = readFileSync(
    path.resolve(HERE, "../../../pages/wms/WmsPickingCartScanPage.tsx"),
    "utf8",
  );

  it("A) dead queue fields are gone from the form", () => {
    expect(panel).not.toContain("Liczba zamówień w zbiorze wieloelementowych");
    expect(panel).not.toContain("Liczba zamówień w zbiorze jednoelementowych");
    expect(panel).not.toContain("Objętość zamówień jednoelementowych");
    expect(panel).not.toContain("Zarządzanie zbiorami");
    expect(panel).not.toContain("Sortuj po wieku zamówienia");
    expect(panel).not.toContain("Powrót na listę");
    expect(panel).not.toContain("multiItemBatchOrdersCount");
    expect(panel).not.toContain("sortOrdersByAge");
    expect(panel).not.toContain("extended.afterBatchCompleteAction");
  });

  it("keeps after-batch radios as terminal SSOT with shared (i)", () => {
    expect(panel).toContain("Akcja po zebraniu zbioru zamówień");
    expect(panel).toContain("Powrót do wyboru typu");
    expect(panel).toContain("PICKING_AFTER_BATCH_SECTION_HELP");
    expect(panel).toContain("SettingInfoButton");
    expect(panel).toContain("after_batch_complete_action");
    expect(PICKING_AFTER_BATCH_SECTION_HELP.title).toBe("Akcja po zebraniu zbioru zamówień");
    expect(DEFAULT_AFTER_BATCH_COMPLETE_ACTION).toBe("back_to_list");
    expect(normalizeAfterBatchCompleteAction(undefined)).toBe("back_to_list");
    expect(normalizeAfterBatchCompleteAction(null)).toBe("back_to_list");
    expect(normalizeAfterBatchCompleteAction("nope")).toBe("back_to_list");
  });

  it("does not duplicate picking_config batch limits in Lista zleceń", () => {
    const queueIdx = panel.indexOf('id="wms-pick-queue"');
    const scanIdx = panel.indexOf('id="wms-pick-scan"');
    expect(queueIdx).toBeGreaterThan(0);
    expect(scanIdx).toBeGreaterThan(queueIdx);
    const queueBlock = panel.slice(queueIdx, scanIdx);
    expect(queueBlock).not.toContain("max_single_orders");
    expect(queueBlock).not.toContain("max_multi_orders");
    expect(queueBlock).not.toContain("max_all_orders");
    expect(panel).toContain("Limity zbioru (bez wymuszenia skanowania)");
  });

  it("G) shortage OK is the only path that runs after-batch action", () => {
    const shortageIf = products.indexOf("if (pickingFinalizeHasShortageSignals(fin))");
    const shortageSetter = products.indexOf("setFinalizeShortageModal({");
    const cleanGo = products.indexOf("goAfterBatchComplete(pickingSession);");
    expect(shortageIf).toBeGreaterThan(0);
    expect(shortageSetter).toBeGreaterThan(shortageIf);
    expect(cleanGo).toBeGreaterThan(shortageSetter);
    const shortageOk = products.slice(products.indexOf("wms-pick-finalize-shortage-title"));
    expect(shortageOk).toContain("goAfterBatchComplete");
    expect(shortageOk).toContain("Oznaczono część zamówień jako zebrane.");
  });

  it("F) assign_new_batch empty start falls back to order-type + no-orders copy", () => {
    expect(products).toContain("AFTER_BATCH_NO_ORDERS_MESSAGE");
    expect(products).toContain("afterBatchAssign");
    expect(cartScan).toContain("AFTER_BATCH_NO_ORDERS_MESSAGE");
    expect(cartScan).toContain("afterBatchAssign");
  });

  it("D) stay_here locks Zebrane and shows completed screen", () => {
    expect(products).toContain("stayHereComplete");
    expect(products).toContain("batchCompleteLocked");
    expect(products).toContain("Zbiór zakończony");
    expect(products).toContain("Wybierz kolejny zbiór");
    expect(products).toContain("Wróć do Zbierania");
  });
});
