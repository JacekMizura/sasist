import { describe, expect, it } from "vitest";

import type { ProductionTerminalDisplaySettings } from "@/api/wmsProductionSettingsApi";
import {
  buildProductIdentityBits,
  buildProductIdentityMetaLine,
  formatTerminalQuantity,
  resolveWmsProductionProductIdentity,
  shouldShowSourceLocation,
  shouldShowStockLevel,
} from "./productionTerminalDisplay";

const ALL_ON: ProductionTerminalDisplaySettings = {
  show_product_image: true,
  show_name: true,
  show_sku: true,
  show_ean: true,
  show_catalog_number: true,
  show_source_location: true,
  show_target_location: false,
  show_stock_level: true,
  show_unit: true,
  show_barcode: true,
};

describe("productionTerminalDisplay", () => {
  it("A: image OFF → showImage false and no imageUrl for layout", () => {
    const r = resolveWmsProductionProductIdentity(
      { ...ALL_ON, show_product_image: false },
      { name: "X", imageUrl: "https://cdn/x.png" },
    );
    expect(r.showImage).toBe(false);
    expect(r.imageUrl).toBeNull();
  });

  it("B: SKU OFF, EAN ON → only EAN bit", () => {
    const bits = buildProductIdentityBits(
      { ...ALL_ON, show_sku: false, show_ean: true, show_catalog_number: false, show_barcode: false },
      { sku: "ST-001", ean: "590123", catalogNumber: "CAT", barcode: "PRD-1" },
    );
    expect(bits).toEqual(["EAN 590123"]);
  });

  it("C: EAN ON but empty → no empty label", () => {
    const line = buildProductIdentityMetaLine(
      { ...ALL_ON, show_sku: false, show_catalog_number: false, show_barcode: false },
      { ean: "  ", sku: null },
    );
    expect(line).toBeNull();
  });

  it("D: unit OFF → bare number", () => {
    expect(formatTerminalQuantity(5, { unit: "szt.", showUnit: false })).toBe("5");
    expect(formatTerminalQuantity(5, { unit: "szt.", showUnit: true })).toBe("5 szt.");
  });

  it("E: source location flag is independent of identity", () => {
    expect(shouldShowSourceLocation({ ...ALL_ON, show_source_location: false })).toBe(false);
    expect(shouldShowSourceLocation({ ...ALL_ON, show_source_location: true })).toBe(true);
  });

  it("F: stock OFF flag", () => {
    expect(shouldShowStockLevel({ ...ALL_ON, show_stock_level: false })).toBe(false);
  });

  it("G: same resolver for queue + execution product fields", () => {
    const display = { ...ALL_ON, show_ean: false, show_barcode: false };
    const product = { name: "Sznurowadła", sku: "ST-001", ean: "590", imageUrl: "/a.png" };
    const queue = resolveWmsProductionProductIdentity(display, product);
    const exec = resolveWmsProductionProductIdentity(display, product);
    expect(queue).toEqual(exec);
    expect(queue.metaLine).toBe("ST-001");
    expect(queue.showName).toBe(true);
  });

  it("H: display flags do not invent qty / lifecycle values", () => {
    const off = { ...ALL_ON, show_unit: false, show_stock_level: false, show_source_location: false };
    expect(formatTerminalQuantity(10.9, { unit: "kg", showUnit: false })).toBe("10");
    expect(shouldShowStockLevel(off)).toBe(false);
    expect(shouldShowSourceLocation(off)).toBe(false);
    // Identity still resolves without mutating product payload shape
    const r = resolveWmsProductionProductIdentity(off, { name: "A", sku: "S" });
    expect(r.name).toBe("A");
    expect(r.metaLine).toBe("S");
  });
});
