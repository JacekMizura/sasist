import { describe, expect, it } from "vitest";
import {
  looksLikeCartBasketScan,
  resolveMultiPickingDetailScan,
  resolveMultiPickingListScan,
} from "./multiPickingScanRoute";

describe("looksLikeCartBasketScan", () => {
  it("recognizes production basket barcodes and slot labels", () => {
    expect(looksLikeCartBasketScan("brck1-B01")).toBe(true);
    expect(looksLikeCartBasketScan("brck1-B02")).toBe(true);
    expect(looksLikeCartBasketScan("CART-0002-B01")).toBe(true);
    expect(looksLikeCartBasketScan("S-1-1")).toBe(true);
    expect(looksLikeCartBasketScan("S-1-2")).toBe(true);
  });

  it("does not treat product EAN as basket", () => {
    expect(looksLikeCartBasketScan("5905450181208")).toBe(false);
  });
});

describe("resolveMultiPickingDetailScan — production states A/B/C", () => {
  const ean = "5905450181208";

  it("state A: EAN → product pick (creates pending)", () => {
    const d = resolveMultiPickingDetailScan(ean, {
      requiresBasketPut: true,
      hasPending: false,
      hasActiveSeries: false,
      productEan: ean,
    });
    expect(d).toEqual({ kind: "product_ean_pick" });
  });

  it("state A: brck1-B02 → confirm_basket probe (NO_PENDING_PUT), never silent", () => {
    const d = resolveMultiPickingDetailScan("brck1-B02", {
      requiresBasketPut: true,
      hasPending: false,
      hasActiveSeries: false,
      productEan: ean,
    });
    expect(d).toEqual({ kind: "confirm_basket", reason: "no_pending_probe" });
  });

  it("state B: pending + brck1-B02 → pending_confirm", () => {
    const d = resolveMultiPickingDetailScan("brck1-B02", {
      requiresBasketPut: true,
      hasPending: true,
      hasActiveSeries: false,
      productEan: ean,
      pendingEligibleLabels: "S-1-1, S-1-2",
    });
    expect(d).toEqual({ kind: "confirm_basket", reason: "pending_confirm" });
  });

  it("state B: pending + EAN → reject", () => {
    const d = resolveMultiPickingDetailScan(ean, {
      requiresBasketPut: true,
      hasPending: true,
      hasActiveSeries: false,
      productEan: ean,
      pendingEligibleLabels: "S-1-1, S-1-2",
    });
    expect(d.kind).toBe("reject_ean_while_pending");
  });

  it("state C: series + EAN → product pick; series + basket → switch", () => {
    expect(
      resolveMultiPickingDetailScan(ean, {
        requiresBasketPut: true,
        hasPending: false,
        hasActiveSeries: true,
        productEan: ean,
      }),
    ).toEqual({ kind: "product_ean_pick" });
    expect(
      resolveMultiPickingDetailScan("brck1-B01", {
        requiresBasketPut: true,
        hasPending: false,
        hasActiveSeries: true,
        productEan: ean,
      }),
    ).toEqual({ kind: "confirm_basket", reason: "series_switch" });
  });
});

describe("resolveMultiPickingListScan — pending + basket on list", () => {
  it("basket scan while pending → confirm_basket (not only toast)", () => {
    expect(
      resolveMultiPickingListScan("brck1-B02", {
        hasPending: true,
        pendingProductMatchesScan: false,
      }),
    ).toEqual({ kind: "confirm_basket" });
  });

  it("same product EAN while pending → resume detail", () => {
    expect(
      resolveMultiPickingListScan("5905450181208", {
        hasPending: true,
        pendingProductMatchesScan: true,
      }),
    ).toEqual({ kind: "resume_pending_detail" });
  });
});
