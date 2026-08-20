import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { validateRequiredProductData } from "../../../utils/validateRequiredProductData";

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe("Przyjęcia → Ogólne validation settings cleanup", () => {
  const section = readFileSync(
    path.resolve(HERE, "../../../components/wms/receiving/ProductReceivingRequirementsSection.tsx"),
    "utf8",
  );
  const panel = readFileSync(
    path.resolve(HERE, "../../../pages/Settings/WmsProductValidationSettingsPanel.tsx"),
    "utf8",
  );
  const overrides = readFileSync(
    path.resolve(HERE, "../../../components/wms/receiving/ProductValidationOverridesSection.tsx"),
    "utf8",
  );

  it("UI has three blocks and nine settings (no require_master_carton flag)", () => {
    expect(section).toContain("Kompletność danych produktu");
    expect(section).toContain("Identyfikowalność");
    expect(section).toContain("Dane opakowania zbiorczego");
    expect(section).toContain("Wymagaj wymiarów produktu");
    expect(section).toContain("Wymagaj wagi produktu");
    expect(section).toContain("Wymagaj numeru partii");
    expect(section).toContain("Wymagaj daty ważności");
    expect(section).toContain("Wymagaj numeru seryjnego");
    expect(section).toContain("Wymagaj EAN opakowania zbiorczego");
    expect(section).toContain("Wymagaj ilości w opakowaniu zbiorczym");
    expect(section).toContain("Wymagaj wymiarów opakowania zbiorczego");
    expect(section).toContain("Wymagaj wagi opakowania zbiorczego");
    expect(section).not.toContain("Produkt posiada opakowanie zbiorcze");
    expect(section).not.toContain("requireMasterCarton:");
    expect(section).not.toMatch(/onChange=\{\(v\) => onChange\(\{ requireMasterCarton: v \}\)\}/);
  });

  it("panel save sends require_master_carton false and mentions SKU exception scope", () => {
    expect(panel).toContain("require_master_carton: false");
    expect(panel).toContain("nie dla pojedynczego magazynu");
  });

  it("product override UI has no skip for dead master_carton flag", () => {
    expect(overrides).not.toContain("Nie wymagaj opakowania zbiorczego");
    expect(overrides).not.toContain("onChange({ validation_skip_master_carton:");
    expect(overrides).not.toContain("globalEnabled={g.require_master_carton}");
  });

  it("weight=0 is incomplete when weight required; weight>0 OK", () => {
    const missing = validateRequiredProductData({
      weight: 0,
      require_recv_weight: true,
    });
    expect(missing.complete).toBe(false);
    expect(missing.missing.some((m) => m.key === "weight")).toBe(true);

    const ok = validateRequiredProductData({
      weight: 1.2,
      require_recv_weight: true,
    });
    expect(ok.complete).toBe(true);
  });

  it("carton master-data completeness matches BE rules", () => {
    expect(
      validateRequiredProductData({
        require_recv_master_carton_ean: true,
        bulk_ean: "",
      }).complete,
    ).toBe(false);
    expect(
      validateRequiredProductData({
        require_recv_master_carton_qty: true,
        units_per_carton: 0,
      }).complete,
    ).toBe(false);
    expect(
      validateRequiredProductData({
        require_recv_master_carton_dims: true,
        carton_length_cm: 10,
        carton_width_cm: 0,
        carton_height_cm: 5,
      }).complete,
    ).toBe(false);
    expect(
      validateRequiredProductData({
        require_recv_master_carton_weight: true,
        carton_weight_kg: 0,
      }).complete,
    ).toBe(false);
  });
});
