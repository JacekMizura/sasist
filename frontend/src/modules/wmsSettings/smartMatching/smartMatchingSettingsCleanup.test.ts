import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WMS_SMART_MATCHING_NAV_SECTIONS } from "../../../pages/Settings/wmsSmartMatchingSettingsNavSections";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");

describe("Smart Matching settings cleanup + history series UI", () => {
  const navSrc = readFileSync(
    path.resolve(ROOT, "pages/Settings/wmsSmartMatchingSettingsNavSections.ts"),
    "utf8",
  );
  const panel = readFileSync(
    path.resolve(ROOT, "pages/Settings/WmsSmartMatchingSettingsPanel.tsx"),
    "utf8",
  );
  const seriesTable = readFileSync(
    path.resolve(ROOT, "pages/Settings/SmartMatchingHistorySeriesTable.tsx"),
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

  it("A) nav has only Ogólne + Historia doboru", () => {
    expect(WMS_SMART_MATCHING_NAV_SECTIONS.map((s) => s.label)).toEqual(["Ogólne", "Historia doboru"]);
  });

  it("B/C) no Widok / Zaawansowane", () => {
    expect(navSrc).not.toContain('label: "Widok"');
    expect(navSrc).not.toContain('label: "Zaawansowane"');
  });

  it("compact table: packaging / product / hit count — no algorithm status columns", () => {
    expect(panel).toContain("SmartMatchingHistorySeriesTable");
    expect(panel).toContain("getWmsSmartMatchingHistorySeries");
    expect(panel).not.toContain("Aktywne reguły dopasowania");
    expect(seriesTable).not.toContain("fingerprint");
    expect(seriesTable).toContain("Opakowanie");
    expect(seriesTable).toContain("Produkt / zestaw");
    expect(seriesTable).toContain("Ilość doborów");
    expect(seriesTable).toContain("Ostatni operator");
    expect(seriesTable).not.toContain(">Status<");
    expect(seriesTable).not.toContain(">Seria<");
    expect(seriesTable).not.toContain("W trakcie");
    expect(seriesTable).not.toContain("Reguła aktywna");
    expect(seriesTable).not.toContain("/ {series.threshold}");
    expect(seriesTable).toContain("hit_count");
    expect(seriesTable).toContain("+{extraCount} innych produktów");
  });

  it("popover: hit numbering, DECYDUJĄCY only via is_decisive, NADPISANIE in detail", () => {
    expect(seriesTable).toContain("SeriesPopover");
    expect(seriesTable).toContain("w-[28rem]");
    expect(seriesTable).toContain("hit.hit_index");
    expect(seriesTable).toContain("hit.is_decisive");
    expect(seriesTable).toContain("Decydujący");
    expect(seriesTable).toContain("Nadpisanie");
    expect(seriesTable).toContain("TRYB:");
    expect(seriesTable).toContain("AKTUALNY PRÓG:");
    expect(seriesTable).not.toContain("created_at) as decisive");
  });

  it("row height stays compact — no multi-line product dump / hash in main cell", () => {
    expect(seriesTable).toContain("truncate");
    expect(seriesTable).toContain("py-1.5");
    expect(seriesTable).toContain("composition_preview");
    expect(seriesTable).not.toContain("composition_key.slice");
    expect(panel).not.toContain("font-mono text-[10px]");
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
