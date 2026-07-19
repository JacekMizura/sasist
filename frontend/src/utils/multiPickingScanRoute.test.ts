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

  it("STATE A: product → pick; basket → EXPECTED_PRODUCT_SCAN consumed", () => {
    expect(
      resolveMultiPickingDetailScan(ean, {
        requiresBasketPut: true,
        hasPending: false,
        hasActiveSeries: false,
        productEan: ean,
        productRemaining: 9,
      }),
    ).toEqual({ kind: "product_ean_pick" });
    expect(
      resolveMultiPickingDetailScan("brck1-B02", {
        requiresBasketPut: true,
        hasPending: false,
        hasActiveSeries: false,
        productEan: ean,
      }),
    ).toEqual({ kind: "reject", code: "EXPECTED_PRODUCT_SCAN", consumed: true });
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

describe("mapWmsScanErrorCode", () => {
  it("maps codes to Polish operator copy without parsing free text", () => {
    const f = mapWmsScanErrorCode("BASKET_PRODUCT_MISMATCH", {
      contextHint: "Oczekiwane koszyki: S-1-1, S-1-2",
    });
    expect(f.severity).toBe("error");
    expect(f.title).toContain("KOSZYK");
    expect(f.message).toContain("nie należy");
    expect(f.message).toContain("S-1-1");
  });
});
