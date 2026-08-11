import { describe, expect, it } from "vitest";
import {
  computeNeedsLocationScan,
  DEFAULT_PICKING_TERMINAL_SCAN_POLICY,
  productHasScannableCode,
  productMatchesScanCode,
  resolveAutoSourceLocationId,
  resolvePickingValidationGates,
} from "./pickingTerminalScanPolicy";

const identity = (s: string) => s.trim();

describe("computeNeedsLocationScan", () => {
  it("A) requireLocationScan always wins over multi-disable", () => {
    expect(
      computeNeedsLocationScan({
        locationCount: 1,
        requireLocationScan: true,
        disableForceLocationScanWhenManyLocations: true,
      }),
    ).toBe(true);
    expect(
      computeNeedsLocationScan({
        locationCount: 3,
        requireLocationScan: true,
        disableForceLocationScanWhenManyLocations: true,
      }),
    ).toBe(true);
  });

  it("B) multi-loc requires scan unless disabled", () => {
    expect(
      computeNeedsLocationScan({
        locationCount: 2,
        requireLocationScan: false,
        disableForceLocationScanWhenManyLocations: false,
      }),
    ).toBe(true);
    expect(
      computeNeedsLocationScan({
        locationCount: 2,
        requireLocationScan: false,
        disableForceLocationScanWhenManyLocations: true,
      }),
    ).toBe(false);
  });

  it("C) single-loc default: no forced scan", () => {
    expect(
      computeNeedsLocationScan({
        locationCount: 1,
        requireLocationScan: DEFAULT_PICKING_TERMINAL_SCAN_POLICY.requireLocationScan,
        disableForceLocationScanWhenManyLocations:
          DEFAULT_PICKING_TERMINAL_SCAN_POLICY.disableForceLocationScanWhenManyLocations,
      }),
    ).toBe(false);
  });
});

describe("resolvePickingValidationGates", () => {
  const basePolicy = { ...DEFAULT_PICKING_TERMINAL_SCAN_POLICY };

  it("requires product scan when setting on and product has code", () => {
    const g = resolvePickingValidationGates({
      locationCount: 1,
      policy: { ...basePolicy, requireProductScanAtLeastOnce: true },
      hasScannableProductCode: true,
    });
    expect(g.needsProductScan).toBe(true);
    expect(g.productBlockedWithoutCode).toBe(false);
  });

  it("allows manual confirm for unscannable when allowProductsWithoutEan", () => {
    const g = resolvePickingValidationGates({
      locationCount: 1,
      policy: {
        ...basePolicy,
        requireProductScanAtLeastOnce: true,
        allowProductsWithoutEan: true,
      },
      hasScannableProductCode: false,
    });
    expect(g.needsProductScan).toBe(false);
    expect(g.allowManualProductConfirm).toBe(true);
    expect(g.productBlockedWithoutCode).toBe(false);
  });

  it("blocks unscannable when allowProductsWithoutEan is off", () => {
    const g = resolvePickingValidationGates({
      locationCount: 1,
      policy: {
        ...basePolicy,
        requireProductScanAtLeastOnce: true,
        allowProductsWithoutEan: false,
      },
      hasScannableProductCode: false,
    });
    expect(g.productBlockedWithoutCode).toBe(true);
    expect(g.needsProductScan).toBe(false);
  });
});

describe("productHasScannableCode / productMatchesScanCode", () => {
  it("treats sku/barcode as scannable without EAN", () => {
    expect(productHasScannableCode({ ean: null, sku: "ABC-1" })).toBe(true);
    expect(productHasScannableCode({ ean: "", barcode: "PRD-1" })).toBe(true);
    expect(productHasScannableCode({ ean: null, sku: null })).toBe(false);
  });

  it("matches sku when EAN empty", () => {
    expect(
      productMatchesScanCode("ABC-1", { ean: null, sku: "ABC-1" }, identity),
    ).toBe(true);
    expect(
      productMatchesScanCode("999", { ean: "111", sku: "ABC-1" }, identity),
    ).toBe(false);
  });
});

describe("resolveAutoSourceLocationId", () => {
  it("returns null when location scan required", () => {
    expect(
      resolveAutoSourceLocationId({
        needsLocationScan: true,
        locations: [{ location_id: 10, stock_quantity: 5 }],
      }),
    ).toBeNull();
  });

  it("picks first stocked location when scan not required", () => {
    expect(
      resolveAutoSourceLocationId({
        needsLocationScan: false,
        locations: [
          { location_id: 1, stock_quantity: 0 },
          { location_id: 2, stock_quantity: 3 },
        ],
      }),
    ).toBe(2);
  });
});
