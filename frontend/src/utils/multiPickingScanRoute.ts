/**
 * MULTI basket-put scan routing (Scanner Helper → page handler).
 * CLASSIFY → READ STATE → VALIDATE TRANSITION → execute | reject(code).
 */

import { normalizeScanEan } from "./wmsScanNormalize";

export type MultiPickingScanContext = {
  requiresBasketPut: boolean;
  hasPending: boolean;
  hasActiveSeries: boolean;
  productEan: string | null | undefined;
  /** Aggregate remaining for current product detail (overpick gate). */
  productRemaining?: number;
  pendingEligibleLabels?: string;
};

export type MultiPickingScanDecision =
  | { kind: "noop" }
  | { kind: "reject"; code: string; consumed: true }
  | { kind: "confirm_basket"; reason: "pending_confirm" | "series_switch" | "no_pending_probe" }
  | { kind: "product_ean_pick" }
  | { kind: "fallthrough" };

export function looksLikeCartBasketScan(raw: string): boolean {
  const s = normalizeScanEan(raw);
  if (!s) return false;
  const up = s.toUpperCase();
  if (/^S-\d+-\d+$/i.test(s)) return true;
  if (/-B\d{1,3}$/i.test(s)) return true;
  if (/^CART[-_].+-B\d+/i.test(up)) return true;
  if (/^BRCK\d*[-_]B\d+/i.test(up)) return true;
  if (/^BASKET[-_]?\d+/i.test(up)) return true;
  return false;
}

/** Digit barcode typical of product EAN/GTIN (not basket/location). */
export function looksLikeProductBarcode(raw: string): boolean {
  const s = normalizeScanEan(raw);
  return /^\d{8,20}$/.test(s);
}

export function resolveMultiPickingDetailScan(
  raw: string,
  ctx: MultiPickingScanContext,
): MultiPickingScanDecision {
  const scan = normalizeScanEan(raw);
  if (!scan) return { kind: "noop" };
  if (!ctx.requiresBasketPut) return { kind: "fallthrough" };

  const productEan = normalizeScanEan(ctx.productEan ?? "");
  const isProductEan = Boolean(productEan) && productEan === scan;
  const rem = ctx.productRemaining;

  // --- STATE B: AWAITING_BASKET ---
  if (ctx.hasPending) {
    if (isProductEan) {
      return { kind: "reject", code: "PENDING_PUT_EXISTS", consumed: true };
    }
    if (looksLikeProductBarcode(scan)) {
      return { kind: "reject", code: "EXPECTED_BASKET_SCAN", consumed: true };
    }
    if (looksLikeCartBasketScan(scan)) {
      return { kind: "confirm_basket", reason: "pending_confirm" };
    }
    return { kind: "reject", code: "UNKNOWN_SCAN_CODE", consumed: true };
  }

  // --- STATE C: ACTIVE_SERIES ---
  if (ctx.hasActiveSeries) {
    if (isProductEan) {
      if (typeof rem === "number" && rem <= 1e-9) {
        return { kind: "reject", code: "OVERPICK_BLOCKED", consumed: true };
      }
      return { kind: "product_ean_pick" };
    }
    if (looksLikeProductBarcode(scan)) {
      return { kind: "reject", code: "FOREIGN_SKU_ON_SERIES", consumed: true };
    }
    if (looksLikeCartBasketScan(scan)) {
      return { kind: "confirm_basket", reason: "series_switch" };
    }
    return { kind: "reject", code: "UNKNOWN_SCAN_CODE", consumed: true };
  }

  // --- STATE A: SELECT_PRODUCT ---
  if (isProductEan) {
    if (typeof rem === "number" && rem <= 1e-9) {
      return { kind: "reject", code: "PRODUCT_ALREADY_COMPLETE", consumed: true };
    }
    return { kind: "product_ean_pick" };
  }
  if (looksLikeCartBasketScan(scan)) {
    return { kind: "reject", code: "EXPECTED_PRODUCT_SCAN", consumed: true };
  }
  if (looksLikeProductBarcode(scan)) {
    return { kind: "reject", code: "PRODUCT_NOT_IN_PICKING", consumed: true };
  }
  return { kind: "reject", code: "UNKNOWN_SCAN_CODE", consumed: true };
}

export function resolveMultiPickingListScan(
  raw: string,
  ctx: {
    hasPending: boolean;
    pendingProductMatchesScan: boolean;
    productHitEligible: boolean;
    productHitComplete: boolean;
    requiresBasketPut: boolean;
  },
):
  | { kind: "noop" }
  | { kind: "reject"; code: string; consumed: true }
  | { kind: "resume_pending_detail" }
  | { kind: "confirm_basket" }
  | { kind: "product_quick_pick" }
  | { kind: "fallthrough" } {
  const scan = normalizeScanEan(raw);
  if (!scan) return { kind: "noop" };

  if (ctx.hasPending) {
    if (ctx.pendingProductMatchesScan) return { kind: "resume_pending_detail" };
    if (looksLikeCartBasketScan(scan)) return { kind: "confirm_basket" };
    if (looksLikeProductBarcode(scan)) {
      return { kind: "reject", code: "EXPECTED_BASKET_SCAN", consumed: true };
    }
    return { kind: "reject", code: "EXPECTED_BASKET_SCAN", consumed: true };
  }

  if (!ctx.requiresBasketPut) return { kind: "fallthrough" };

  if (looksLikeCartBasketScan(scan)) {
    return { kind: "reject", code: "EXPECTED_PRODUCT_SCAN", consumed: true };
  }

  if (ctx.productHitEligible) return { kind: "product_quick_pick" };
  if (ctx.productHitComplete) {
    return { kind: "reject", code: "PRODUCT_ALREADY_COMPLETE", consumed: true };
  }
  if (looksLikeProductBarcode(scan)) {
    return { kind: "reject", code: "PRODUCT_NOT_IN_PICKING", consumed: true };
  }
  return { kind: "fallthrough" };
}

export function multiScanTrace(event: string, fields: Record<string, string | number | boolean | null | undefined>) {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v === null ? "null" : String(v)}`);
  // eslint-disable-next-line no-console
  console.info(`MULTI_SCAN_TRACE event=${event}${parts.length ? ` ${parts.join(" ")}` : ""}`);
}
