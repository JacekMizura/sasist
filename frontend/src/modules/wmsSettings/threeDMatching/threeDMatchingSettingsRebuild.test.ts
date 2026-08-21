import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WMS_THREE_D_MATCHING_NAV_SECTIONS } from "../../../pages/Settings/wmsThreeDMatchingSettingsNavSections";
import {
  configFromApi,
  configToApiBody,
  DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG,
} from "../../../pages/Settings/wmsPackagingProposalLocalConfig";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");

describe("3D Matching settings rebuild", () => {
  const panel = readFileSync(
    path.resolve(ROOT, "pages/Settings/WmsThreeDMatchingSettingsPanel.tsx"),
    "utf8",
  );
  const chrome = readFileSync(path.resolve(ROOT, "pages/Settings/WmsSettingsChrome.tsx"), "utf8");
  const catalog = readFileSync(path.resolve(ROOT, "pages/Settings/settingsSearch/catalog.ts"), "utf8");
  const engineForm = readFileSync(
    path.resolve(ROOT, "pages/Settings/WmsPackagingProposalEngineConfigForm.tsx"),
    "utf8",
  );

  it("rename: 3D Matching, no Dopasowanie przestrzenne", () => {
    expect(chrome).toContain('label: "3D Matching"');
    expect(chrome).not.toContain("Dopasowanie przestrzenne");
    expect(panel).toContain('title="3D Matching"');
    expect(panel).toContain("Automatyczny dobór opakowań na podstawie wymiarów i wagi produktów.");
    expect(panel).not.toContain("Dopasowanie przestrzenne");
    expect(catalog).toContain('three_d_matching: "3D Matching"');
  });

  it("Ustawienia + Historia doboru sections", () => {
    expect(WMS_THREE_D_MATCHING_NAV_SECTIONS.map((s) => s.label)).toEqual([
      "Ustawienia",
      "Historia doboru",
    ]);
    expect(panel).toContain("wms-3d-history");
    expect(panel).toContain("ThreeDMatchingHistoryTable");
    expect(panel).not.toContain("wms-3d-dashboard");
    expect(panel).not.toContain("PackagingIntelligenceKpi");
    expect(panel).not.toContain("dimensionToleranceMm");
    expect(panel).not.toContain("localStorage");
  });

  it("toggle + filler wired to BE keys", () => {
    expect(panel).toContain('settingId="three_d.enabled"');
    expect(panel).toContain('settingId="three_d.filler_percent"');
    expect(panel).toContain("threeDEnabled");
    expect(panel).toContain("threeDFillerPercent");
    expect(panel).toContain("putWmsSmartMatchingSettings");
  });

  it("strategy lives once in Smart workflow form", () => {
    expect(engineForm).toContain('settingId="packaging.strategy"');
    expect(engineForm).toContain("Automatyczny dobór opakowania");
    expect(panel).not.toContain('settingId="packaging.strategy"');
  });

  it("config round-trip includes independent enables + filler + strategy", () => {
    const cfg = configFromApi({
      enabled: true,
      smart_enabled: true,
      three_d_enabled: false,
      three_d_filler_percent: 10,
      packaging_strategy: "THREE_D_ONLY",
      identical_orders_threshold: 3,
      proposal_init_status_id: null,
      auto_label_enabled: false,
      auto_label_status_ids: [],
    });
    expect(cfg.smartEnabled).toBe(true);
    expect(cfg.threeDEnabled).toBe(false);
    expect(cfg.threeDFillerPercent).toBe(10);
    expect(cfg.packagingStrategy).toBe("THREE_D_ONLY");
    const body = configToApiBody(cfg, 1, 2);
    expect(body.smart_enabled).toBe(true);
    expect(body.three_d_enabled).toBe(false);
    expect(body.three_d_filler_percent).toBe(10);
    expect(body.packaging_strategy).toBe("THREE_D_ONLY");
    expect(DEFAULT_WMS_PACKAGING_PROPOSAL_LOCAL_CONFIG.threeDFillerPercent).toBe(0);
  });
});
