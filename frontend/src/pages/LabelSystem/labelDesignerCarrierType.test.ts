import { describe, expect, it } from "vitest";
import {
  LABEL_VARIABLE_CATEGORIES,
  PREVIEW_SAMPLES,
  TEMPLATE_TYPE_CATEGORIES,
  TEMPLATE_TYPE_OPTIONS,
} from "../../types/labelSystem";
import {
  LABEL_DESIGNER_TYPE_OPTIONS,
  labelDesignerTypeLabel,
  labelDesignerVariableCategoryType,
} from "./labelDesignerTypeOptions";
import { groupVariablesForDesigner } from "./labelDesignerVariableGroups";
import { generatePreset, formatPresetSpecLine } from "../../services/labelPresets";
import carrierPresetJson from "../../labelSystem/presets/carrierLabelHorizontal100x50.json";

describe("carrier template type — SSOT", () => {
  it("registers carrier in FE type enums and dropdown", () => {
    expect(TEMPLATE_TYPE_OPTIONS.some((o) => o.value === "carrier" && o.label === "Nośnik")).toBe(true);
    expect(LABEL_DESIGNER_TYPE_OPTIONS.some((o) => o.value === "carrier" && o.label === "Nośnik")).toBe(true);
    expect(labelDesignerTypeLabel("carrier")).toBe("Nośnik");
    expect(labelDesignerVariableCategoryType("carrier")).toBe("carrier");
  });

  it("maps carrier template_type to carrier variable category only", () => {
    expect(TEMPLATE_TYPE_CATEGORIES.carrier).toEqual(["carrier"]);
    const cats = LABEL_VARIABLE_CATEGORIES.filter((c) =>
      TEMPLATE_TYPE_CATEGORIES.carrier.includes(c.id),
    );
    expect(cats).toHaveLength(1);
    expect(cats[0].id).toBe("carrier");
    const tokens = cats[0].items.map((i) => i.token);
    expect(tokens).toContain("{carrier_code}");
    expect(tokens).toContain("{carrier_scan_code}");
    expect(tokens).toContain("{barcode_data}");
    expect(tokens.some((t) => t.includes("loc_"))).toBe(false);
  });

  it("Variables tab groups carrier under Nośnik (not Lokalizacja/Operator)", () => {
    const cats = LABEL_VARIABLE_CATEGORIES.filter((c) => c.id === "carrier");
    const grouped = groupVariablesForDesigner(cats);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].group.id).toBe("carrier");
    expect(grouped[0].group.label).toBe("Nośnik");
    expect(grouped[0].items.map((i) => i.variable.id)).toContain("carrier_code");
  });

  it("preview sample uses PAL-000006 and ESP:carrier:6", () => {
    expect(PREVIEW_SAMPLES.carrier.carrier_code).toBe("PAL-000006");
    expect(PREVIEW_SAMPLES.carrier.carrier_scan_code).toBe("ESP:carrier:6");
    expect(PREVIEW_SAMPLES.carrier.barcode_data).toBe("ESP:carrier:6");
  });

  it("carrier horizontal preset JSON and generatePreset keep template_type=carrier", () => {
    expect(carrierPresetJson.template_type).toBe("carrier");
    const qr = (carrierPresetJson.elements as Array<{ id?: string; dataBinding?: string }>).find(
      (e) => e.id === "carrier-qr",
    );
    expect(qr?.dataBinding).toBe("barcode_data");
    const text = (carrierPresetJson.elements as Array<{ id?: string; binding?: string }>).find(
      (e) => e.id === "carrier-number",
    );
    expect(text?.binding).toBe("{carrier_code}");

    const generated = generatePreset("CARRIER_LABEL_HORIZONTAL");
    expect(generated.template_type).toBe("carrier");
    expect(generated.widthMm).toBe(100);
    expect(generated.heightMm).toBe(50);
    expect(formatPresetSpecLine("CARRIER_LABEL_HORIZONTAL")).toContain("Nośnik");

    const roundTrip = JSON.parse(JSON.stringify(generated)) as typeof generated;
    expect(roundTrip.template_type).toBe("carrier");
  });

  it("does not remap location presets to carrier", () => {
    const loc = generatePreset("LOCATION_BASIC");
    expect(loc.template_type).toBe("location");
    const pallet = generatePreset("PALLET_LABEL");
    expect(pallet.template_type).toBe("location");
  });
});
