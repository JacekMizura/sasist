import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WMS_SMART_MATCHING_NAV_SECTIONS } from "../../../pages/Settings/wmsSmartMatchingSettingsNavSections";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");

describe("Smart Matching settings + history events v2 UI", () => {
  const navSrc = readFileSync(
    path.resolve(ROOT, "pages/Settings/wmsSmartMatchingSettingsNavSections.ts"),
    "utf8",
  );
  const panel = readFileSync(
    path.resolve(ROOT, "pages/Settings/WmsSmartMatchingSettingsPanel.tsx"),
    "utf8",
  );
  const eventsTable = readFileSync(
    path.resolve(ROOT, "pages/Settings/SmartMatchingHistoryEventsTable.tsx"),
    "utf8",
  );
  const engineForm = readFileSync(
    path.resolve(ROOT, "pages/Settings/WmsPackagingProposalEngineConfigForm.tsx"),
    "utf8",
  );
  const gate = readFileSync(
    path.resolve(ROOT, "components/wms/packing/PackingCartonGateModal.tsx"),
    "utf8",
  );
  const packingPage = readFileSync(
    path.resolve(ROOT, "pages/wms/WmsPackingOrderPage.tsx"),
    "utf8",
  );
  const packingView = readFileSync(
    path.resolve(ROOT, "components/wms/packing/PackingView.tsx"),
    "utf8",
  );
  const catalog = readFileSync(
    path.resolve(ROOT, "pages/Settings/settingsSearch/catalog.ts"),
    "utf8",
  );
  const fitPanelPath = path.resolve(ROOT, "components/wms/packing/PackingFitRecommendationPanel.tsx");
  const legacySeriesPath = path.resolve(ROOT, "pages/Settings/SmartMatchingHistorySeriesTable.tsx");

  it("A) nav has only Ogólne + Historia doboru", () => {
    expect(WMS_SMART_MATCHING_NAV_SECTIONS.map((s) => s.label)).toEqual(["Ogólne", "Historia doboru"]);
  });

  it("B/C) no Widok / Zaawansowane", () => {
    expect(navSrc).not.toContain('label: "Widok"');
    expect(navSrc).not.toContain('label: "Zaawansowane"');
  });

  it("history v2 table: decision columns — no composition series / hash", () => {
    expect(panel).toContain("SmartMatchingHistoryEventsTable");
    expect(panel).not.toContain("SmartMatchingHistorySeriesTable");
    expect(panel).not.toContain("getWmsSmartMatchingHistorySeries");
    expect(existsSync(legacySeriesPath)).toBe(false);
    expect(eventsTable).toContain("Opakowanie");
    expect(eventsTable).toContain("Produkt / zestaw");
    expect(eventsTable).toContain("Ilość");
    expect(eventsTable).toContain("Dopasowanie");
    expect(eventsTable).not.toContain("composition_key");
    expect(eventsTable).not.toContain("fingerprint");
    expect(eventsTable).not.toContain("W trakcie");
    expect(eventsTable).not.toContain("Ilość doborów");
  });

  it("popover: hit_index vs quantity separate; DECYDUJĄCY / PRZERWAŁ REGUŁĘ", () => {
    expect(eventsTable).toContain("LearningPopover");
    expect(eventsTable).toContain("hit.hit_index");
    expect(eventsTable).toContain("Ilość:");
    expect(eventsTable).toContain("hit.quantity");
    expect(eventsTable).toContain("Decydujący");
    expect(eventsTable).toContain("Przerwał regułę");
    expect(eventsTable).toContain("TRYB:");
    expect(eventsTable).toContain("series.rule.label");
  });

  it("match badges: utworzona / nadpisanie / przerwana / ręczna", () => {
    expect(eventsTable).toContain("Reguła utworzona");
    expect(eventsTable).toContain("Nadpisanie");
    expect(eventsTable).toContain("Reguła przerwana");
    expect(eventsTable).toContain("Ręczna");
    expect(eventsTable).toContain("Konflikt");
  });

  it("E/F/G) Ogólne still wires enabled, threshold, proposal_init_status", () => {
    expect(engineForm).toContain("smart.packaging_suggestions_enabled");
    expect(engineForm).toContain("smart.identical_orders_threshold");
    expect(engineForm).toContain("smart.proposal_init_status");
    expect(catalog).toContain('id: "smart.packaging_suggestions_enabled"');
  });

  it("I) reset copy deletes rules only", () => {
    expect(panel).toContain("Usuń aktywne reguły");
    expect(panel).toContain("Historia decyzji pozostanie");
  });

  it("J/K/L) dead panel/prop gone; PackingView still recommended_cartons", () => {
    expect(existsSync(fitPanelPath)).toBe(false);
    expect(gate).not.toContain("packagingSuggestions");
    expect(packingPage).toContain("recommendedCartons={packingDetail.recommended_cartons");
    expect(packingView).toContain("recommendedCartons:");
  });
});
