/**
 * MULTI basket-put scan routing (Scanner Helper → page handler).
 * Pure decisions — unit-tested without React; pages execute the actions.
 */

import { normalizeScanEan } from "./wmsScanNormalize";

export type MultiPickingScanContext = {
  requiresBasketPut: boolean;
  hasPending: boolean;
  hasActiveSeries: boolean;
  productEan: string | null | undefined;
  /** Eligible basket labels for toast copy (optional). */
  pendingEligibleLabels?: string;
};

export type MultiPickingScanDecision =
  | { kind: "noop" }
  | { kind: "reject_ean_while_pending"; message: string }
  | { kind: "confirm_basket"; reason: "pending_confirm" | "series_switch" | "no_pending_probe" }
  | { kind: "product_ean_pick" }
  | { kind: "fallthrough" };

/**
 * Physical basket barcodes used on carts (e.g. brck1-B01) and human slot labels (S-1-2).
 * Must NOT treat these as warehouse locations for picking put.
 */
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

export function resolveMultiPickingDetailScan(
  raw: string,
  ctx: MultiPickingScanContext,
): MultiPickingScanDecision {
  const scan = normalizeScanEan(raw);
  if (!scan) return { kind: "noop" };
  if (!ctx.requiresBasketPut) return { kind: "fallthrough" };

  const productEan = normalizeScanEan(ctx.productEan ?? "");
  const isProductEan = Boolean(productEan) && productEan === scan;
  const labels = ctx.pendingEligibleLabels || "właściwy koszyk";

  if (ctx.hasPending) {
    if (isProductEan) {
      return {
        kind: "reject_ean_while_pending",
        message: `NAJPIERW POTWIERDŹ KOSZYK. Zeskanuj jeden z koszyków: ${labels}.`,
      };
    }
    return { kind: "confirm_basket", reason: "pending_confirm" };
  }

  if (ctx.hasActiveSeries) {
    if (isProductEan) return { kind: "product_ean_pick" };
    if (looksLikeCartBasketScan(scan)) {
      return { kind: "confirm_basket", reason: "series_switch" };
    }
    return { kind: "fallthrough" };
  }

  // State A: no pending, no series — EAN creates pending; basket must not be silent.
  if (isProductEan) return { kind: "product_ean_pick" };
  if (looksLikeCartBasketScan(scan)) {
    return { kind: "confirm_basket", reason: "no_pending_probe" };
  }
  return { kind: "fallthrough" };
}

export function resolveMultiPickingListScan(
  raw: string,
  ctx: { hasPending: boolean; pendingProductMatchesScan: boolean },
):
  | { kind: "noop" }
  | { kind: "resume_pending_detail" }
  | { kind: "confirm_basket" }
  | { kind: "block_other_product" }
  | { kind: "fallthrough" } {
  const scan = normalizeScanEan(raw);
  if (!scan) return { kind: "noop" };
  if (!ctx.hasPending) return { kind: "fallthrough" };
  if (ctx.pendingProductMatchesScan) return { kind: "resume_pending_detail" };
  if (looksLikeCartBasketScan(scan)) return { kind: "confirm_basket" };
  return { kind: "block_other_product" };
}

/** Dev / ops trace — no PII. */
export function multiScanTrace(event: string, fields: Record<string, string | number | boolean | null | undefined>) {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v === null ? "null" : String(v)}`);
  // eslint-disable-next-line no-console
  console.info(`MULTI_SCAN_TRACE event=${event}${parts.length ? ` ${parts.join(" ")}` : ""}`);
}
