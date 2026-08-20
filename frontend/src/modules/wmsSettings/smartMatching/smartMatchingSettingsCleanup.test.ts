import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WMS_SMART_MATCHING_NAV_SECTIONS } from "../../../pages/Settings/wmsSmartMatchingSettingsNavSections";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const REPO = path.resolve(ROOT, "..");

describe("Smart Matching settings cleanup", () => {
  const navSrc = readFileSync(
    path.resolve(ROOT, "pages/Settings/wmsSmartMatchingSettingsNavSections.ts"),
    "utf8",
  );
  const panel = readFileSync(
    path.resolve(ROOT, "pages/Settings/WmsSmartMatchingSettingsPanel.tsx"),
    "utf8",
  );
  const engineForm = readFileSync(
    path.resolve(ROOT, "pages/Settings/WmsPackagingProposalEngineConfigForm.tsx"),
    "utf8",
  );
  const kpi = readFileSync(
    path.resolve(ROOT, "pages/Settings/wmsPackagingIntelligenceKpiBlocks.tsx"),
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

  it("A) nav has only Ogólne + Historia doboru", () => {
    expect(WMS_SMART_MATCHING_NAV_SECTIONS.map((s) => s.label)).toEqual(["Ogólne", "Historia doboru"]);
    expect(WMS_SMART_MATCHING_NAV_SECTIONS.map((s) => s.id)).toEqual([
      "wms-smart-config",
      "wms-smart-history",
    ]);
  });

  it("B) no Widok in Smart Matching nav/panel", () => {
    expect(WMS_SMART_MATCHING_NAV_SECTIONS.some((s) => s.label === "Widok")).toBe(false);
    expect(navSrc).not.toContain("wms-smart-dashboard");
    expect(navSrc).not.toContain('label: "Widok"');
    expect(panel).not.toContain('id="wms-smart-dashboard"');
    expect(panel).not.toContain('title="Widok"');
  });

  it("C) no Zaawansowane in Smart Matching nav/panel", () => {
    expect(WMS_SMART_MATCHING_NAV_SECTIONS.some((s) => s.label === "Zaawansowane")).toBe(false);
    expect(navSrc).not.toContain("wms-smart-advanced");
    expect(navSrc).not.toContain('label: "Zaawansowane"');
    expect(panel).not.toContain('id="wms-smart-advanced"');
    expect(panel).not.toContain('title="Zaawansowane"');
  });

  it("D) no fake metrics in Smart Matching settings UI", () => {
    expect(panel).not.toContain("Śr. pewność");
    expect(panel).not.toContain("Śr. wypełnienie");
    expect(panel).not.toContain("Produkty bez wymiarów");
    expect(panel).not.toContain("Nieudane dopasowania");
    expect(panel).not.toContain("Propozycje (łącznie)");
    expect(panel).not.toContain("PackagingIntelligenceKpi");
    expect(kpi).toContain("Aktywne reguły dopasowania");
    expect(kpi).not.toContain("Śr. pewność");
    expect(kpi).not.toContain("Propozycje (łącznie)");
  });

  it("E/F/G) Ogólne still wires enabled, threshold, proposal_init_status", () => {
    expect(panel).toContain("WmsPackagingProposalEngineConfigForm");
    expect(panel).toContain("showSmartLearningThreshold");
    expect(engineForm).toContain("smart.packaging_suggestions_enabled");
    expect(engineForm).toContain("smart.identical_orders_threshold");
    expect(engineForm).toContain("smart.proposal_init_status");
    expect(engineForm).toContain("Historia pakowań nadal jest zapisywana");
    expect(catalog).toContain('id: "smart.packaging_suggestions_enabled"');
    expect(catalog).toContain('id: "smart.identical_orders_threshold"');
    expect(catalog).toContain('id: "smart.proposal_init_status"');
  });

  it("H) Historia still loads and shows audit columns", () => {
    expect(panel).toContain("getWmsSmartMatchingHistory");
    expect(panel).toContain("Historia decyzji pakowania używana do budowania reguł");
    expect(panel).toContain("Zamówienie");
    expect(panel).toContain("Skład / fingerprint");
    expect(panel).toContain("Sugerowane");
    expect(panel).toContain("Wybrane");
    expect(panel).toContain("Operator");
    expect(panel).toContain("Nadpisanie");
  });

  it("I) reset copy deletes rules only, not history", () => {
    expect(panel).toContain("Usuń aktywne reguły");
    expect(panel).toContain("Historia decyzji pozostanie");
    expect(panel).toContain("postWmsSmartMatchingReset");
    expect(panel).not.toContain("Reset Smart Matching");
  });

  it("J) PackingFitRecommendationPanel deleted / 0 consumers", () => {
    expect(existsSync(fitPanelPath)).toBe(false);
    expect(packingPage).not.toContain("PackingFitRecommendationPanel");
    expect(packingView).not.toContain("PackingFitRecommendationPanel");
  });

  it("K) dead packagingSuggestions prop removed from carton gate", () => {
    expect(gate).not.toContain("packagingSuggestions");
    expect(packingPage).not.toContain("packagingSuggestions=");
  });

  it("L) PackingView still receives recommended_cartons", () => {
    expect(packingPage).toContain("recommendedCartons={packingDetail.recommended_cartons");
    expect(packingView).toContain("recommendedCartons:");
  });

  it("copy avoids ML language", () => {
    expect(panel).toContain("powtarzalnych decyzji pakowania");
    expect(panel.toLowerCase()).not.toContain("uczenie maszynowe");
    expect(engineForm).toContain("Reguły na podstawie historii pakowań");
    expect(engineForm).not.toContain("Uczenie");
  });

  it("fit panel path is absent from repo tree under packing", () => {
    const packingDir = path.resolve(ROOT, "components/wms/packing");
    const listing = readFileSync(
      // ensure path exists by reading a sibling
      path.resolve(packingDir, "PackingView.tsx"),
      "utf8",
    );
    expect(listing.length).toBeGreaterThan(0);
    expect(existsSync(path.resolve(REPO, "frontend/src/components/wms/packing/PackingFitRecommendationPanel.tsx"))).toBe(
      false,
    );
  });
});
