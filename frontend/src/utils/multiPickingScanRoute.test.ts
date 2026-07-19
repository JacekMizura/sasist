import { describe, expect, it } from "vitest";
import {
  looksLikeCartBasketScan,
  resolveMultiPickingDetailScan,
  resolveMultiPickingListScan,
} from "./multiPickingScanRoute";
import { mapWmsScanErrorCode } from "../wms/scanFeedback/wmsScanErrorCatalog";

describe("looksLikeCartBasketScan", () => {
  it("recognizes production basket barcodes and slot labels", () => {
    expect(looksLikeCartBasketScan("brck1-B01")).toBe(true);
    expect(looksLikeCartBasketScan("brck1-B02")).toBe(true);
    expect(looksLikeCartBasketScan("S-1-2")).toBe(true);
  });
});

describe("resolveMultiPickingDetailScan — strict states", () => {
  const ean = "5905450181208";

  it("STATE A quantity mode: product EAN → EXPECTED_BASKET_SCAN; basket → select_destination", () => {
    expect(
      resolveMultiPickingDetailScan(ean, {
        requiresBasketPut: true,
        hasPending: false,
        hasActiveSeries: false,
        productEan: ean,
        productRemaining: 9,
        quantityMode: true,
      }),
    ).toEqual({ kind: "reject", code: "EXPECTED_BASKET_SCAN", consumed: true });
    expect(
      resolveMultiPickingDetailScan("brck1-B02", {
        requiresBasketPut: true,
        hasPending: false,
        hasActiveSeries: false,
        productEan: ean,
        quantityMode: true,
      }),
    ).toEqual({ kind: "confirm_basket", reason: "select_destination" });
  });

  it("quantity mode suppresses leftover series EAN+1", () => {
    expect(
      resolveMultiPickingDetailScan(ean, {
        requiresBasketPut: true,
        hasPending: false,
        hasActiveSeries: true,
        productEan: ean,
        productRemaining: 8,
        quantityMode: true,
      }),
    ).toEqual({ kind: "reject", code: "EXPECTED_BASKET_SCAN", consumed: true });
  });

  it("legacy STATE A without quantityMode still allows product_ean_pick", () => {
    const d = resolveMultiPickingDetailScan(ean, {
      requiresBasketPut: true,
      hasPending: false,
      hasActiveSeries: false,
      productEan: ean,
      productRemaining: 8,
    });
    expect(d).toEqual({ kind: "product_ean_pick" });
  });

  it("STATE B after list PRODUCT_SCAN: basket confirm — no second EAN", () => {
    expect(
      resolveMultiPickingDetailScan("brck1-B02", {
        requiresBasketPut: true,
        hasPending: true,
        hasActiveSeries: false,
        productEan: ean,
      }),
    ).toEqual({ kind: "confirm_basket", reason: "pending_confirm" });
    expect(
      resolveMultiPickingDetailScan(ean, {
        requiresBasketPut: true,
        hasPending: true,
        hasActiveSeries: false,
        productEan: ean,
      }),
    ).toEqual({ kind: "reject", code: "PENDING_PUT_EXISTS", consumed: true });
  });

  it("STATE B: product EAN → EXPECTED_BASKET_SCAN; other EAN → EXPECTED_BASKET_SCAN; basket → confirm", () => {
    expect(
      resolveMultiPickingDetailScan(ean, {
        requiresBasketPut: true,
        hasPending: true,
        hasActiveSeries: false,
        productEan: ean,
      }),
    ).toEqual({ kind: "reject", code: "PENDING_PUT_EXISTS", consumed: true });
    expect(
      resolveMultiPickingDetailScan("5905450189999", {
        requiresBasketPut: true,
        hasPending: true,
        hasActiveSeries: false,
        productEan: ean,
      }),
    ).toEqual({ kind: "reject", code: "EXPECTED_BASKET_SCAN", consumed: true });
    expect(
      resolveMultiPickingDetailScan("brck1-B02", {
        requiresBasketPut: true,
        hasPending: true,
        hasActiveSeries: false,
        productEan: ean,
      }),
    ).toEqual({ kind: "confirm_basket", reason: "pending_confirm" });
  });

  it("STATE C: foreign SKU consumed; overpick blocked", () => {
    expect(
      resolveMultiPickingDetailScan("5905450189999", {
        requiresBasketPut: true,
        hasPending: false,
        hasActiveSeries: true,
        productEan: ean,
      }),
    ).toEqual({ kind: "reject", code: "FOREIGN_SKU_ON_SERIES", consumed: true });
    expect(
      resolveMultiPickingDetailScan(ean, {
        requiresBasketPut: true,
        hasPending: false,
        hasActiveSeries: true,
        productEan: ean,
        productRemaining: 0,
      }),
    ).toEqual({ kind: "reject", code: "OVERPICK_BLOCKED", consumed: true });
  });
});

describe("resolveMultiPickingListScan", () => {
  it("basket while pending → confirm; foreign product → reject consumed", () => {
    expect(
      resolveMultiPickingListScan("brck1-B02", {
        hasPending: true,
        pendingProductMatchesScan: false,
        productHitEligible: false,
        productHitComplete: false,
        requiresBasketPut: true,
      }),
    ).toEqual({ kind: "confirm_basket" });
    expect(
      resolveMultiPickingListScan("5905450189999", {
        hasPending: true,
        pendingProductMatchesScan: false,
        productHitEligible: false,
        productHitComplete: false,
        requiresBasketPut: true,
      }).kind,
    ).toBe("reject");
  });
});

describe("resolveMultiPickingListScan — non-MULTI", () => {
  it("requiresBasketPut=false → fallthrough (BULK/CARTLESS/packing must not be captured)", () => {
    expect(
      resolveMultiPickingListScan("brck1-B01", {
        hasPending: false,
        pendingProductMatchesScan: false,
        productHitEligible: false,
        productHitComplete: false,
        requiresBasketPut: false,
      }),
    ).toEqual({ kind: "fallthrough" });
  });
});

describe("popup exactly-once contract", () => {
  const codes = [
    "PRODUCT_NOT_IN_PICKING",
    "PRODUCT_ALREADY_COMPLETE",
    "EXPECTED_PRODUCT_SCAN",
    "EXPECTED_BASKET_SCAN",
    "PENDING_PUT_EXISTS",
    "NO_PENDING_PUT",
    "BASKET_MISMATCH",
    "BASKET_OTHER_CART",
    "BASKET_EMPTY",
    "BASKET_PRODUCT_MISMATCH",
    "BASKET_PRODUCT_ALREADY_COMPLETE",
    "OVERPICK_BLOCKED",
    "FOREIGN_SKU_ON_SERIES",
    "BASKET_PUT_OWNED_BY_OTHER",
    "UNKNOWN_SCAN_CODE",
    "CART_NOT_ACTIVE",
  ] as const;

  it("every domain code maps to operator Polish copy (never raw HTTP text)", () => {
    for (const code of codes) {
      const f = mapWmsScanErrorCode(code);
      expect(f.code).toBe(code);
      expect(f.title.length).toBeGreaterThan(2);
      expect(f.message.toLowerCase()).not.toContain("request failed");
      expect(f.message.toLowerCase()).not.toContain("status code");
    }
  });

  it("SERIES_DESTINATION_SWITCHED is success/info, not error", () => {
    const f = mapWmsScanErrorCode("SERIES_DESTINATION_SWITCHED");
    expect(f.severity).toBe("success");
  });

  it("STATE B reject is consumed — no fallthrough to product search", () => {
    const d = resolveMultiPickingDetailScan("5905450181208", {
      requiresBasketPut: true,
      hasPending: true,
      hasActiveSeries: false,
      productEan: "5905450181208",
    });
    expect(d).toEqual({ kind: "reject", code: "PENDING_PUT_EXISTS", consumed: true });
    expect(d.kind === "reject" && d.consumed).toBe(true);
  });
});
