import type { ComplaintLinePatchPayload } from "../../api/complaintsApi";
import type { ComplaintDetail, ComplaintLineDetail } from "../../types/complaint";

export type LineSettlementKind = "REPLACEMENT" | "REFUND" | "PARTIAL_REFUND" | "REJECTION";

/** Tylko zwrot — rozliczenie finansowe wyłącznie przy decyzji „zwrot”. */
export const REFUND_SETTLEMENT_OPTIONS: { id: LineSettlementKind; label: string }[] = [
  { id: "REFUND", label: "Pełny zwrot" },
  { id: "PARTIAL_REFUND", label: "Częściowy zwrot" },
];

export function lineSettlementChoicesForRefund() {
  return REFUND_SETTLEMENT_OPTIONS;
}

/** Sekcja kwoty/zapisu rozliczenia — tylko dla decyzji zwrot. */
export function lineSettlementSectionVisible(decision: string | null | undefined): boolean {
  return String(decision ?? "").trim().toLowerCase() === "refund";
}

export function lineNeedsRefundSettlementUi(decision: string | null | undefined): boolean {
  return lineSettlementSectionVisible(decision);
}

/** Maks. zwrot za pozycję (wg ceny jednostkowej × ilość). */
export function lineProductRefundCap(ln: ComplaintLineDetail): number | null {
  const u = typeof ln.unit_price === "number" && Number.isFinite(ln.unit_price) ? ln.unit_price : null;
  const q = typeof ln.quantity === "number" && ln.quantity > 0 ? ln.quantity : null;
  if (u == null || q == null) return null;
  return Math.round(u * q * 100) / 100;
}

export function formatRefundAmountStr(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
}

export function lineNonFinancialDecisionMessage(decision: string | null | undefined): string | null {
  const d = String(decision ?? "").trim().toLowerCase();
  if (d === "exchange") return "Wymiana — bez rozliczenia";
  if (d === "reject") return "Odrzucenie — bez rozliczenia";
  return null;
}

export function buildLineDecisionPatch(
  ln: ComplaintLineDetail,
  kind: "repair" | "exchange" | "refund",
): ComplaintLinePatchPayload {
  const dec = String(ln.decision ?? "").trim().toLowerCase();
  if (kind === "repair") {
    return dec === "repair" ? { decision: null } : { decision: "repair" };
  }
  if (kind === "exchange") {
    return dec === "exchange" ? { decision: null } : { decision: "exchange" };
  }
  return dec === "refund" ? { decision: null } : { decision: "refund" };
}

export type ComplaintRefundSummaryAggregate = {
  productsRefundByCurrency: Record<string, number>;
  shippingRefundByCurrency: Record<string, number>;
  finalTotalByCurrency: Record<string, number>;
  refundLineCount: number;
  exchangeLineCount: number;
  rejectedLineCount: number;
  includesShippingRefund: boolean;
};

/** Zestawienie zwrotów: sumy z linii + jednorazowy zwrot wysyłki, gdy jest zapisany zwrot produktów. */
export function aggregateComplaintRefundSummary(data: ComplaintDetail | null | undefined): ComplaintRefundSummaryAggregate {
  const lines = data?.lines ?? [];
  const orderCur = (data?.order?.currency ?? "PLN").trim() || "PLN";
  const shippingCost =
    typeof data?.order?.shipping_cost === "number" && Number.isFinite(data.order.shipping_cost)
      ? Math.max(0, data.order.shipping_cost)
      : 0;

  const productsRefundByCurrency: Record<string, number> = {};
  let refundLineCount = 0;
  let exchangeLineCount = 0;
  let rejectedLineCount = 0;
  let hasSavedProductRefund = false;

  for (const ln of lines) {
    const d = String(ln.decision ?? "").trim().toLowerCase();
    if (d === "refund") refundLineCount++;
    if (d === "exchange") exchangeLineCount++;
    if (d === "reject") rejectedLineCount++;

    const st = String(ln.settlement_type ?? "").trim().toUpperCase();
    if (st === "REFUND" || st === "PARTIAL_REFUND") {
      const amt = typeof ln.settlement_amount === "number" && Number.isFinite(ln.settlement_amount) ? ln.settlement_amount : 0;
      if (amt > 0) {
        hasSavedProductRefund = true;
        const cur = (ln.settlement_currency ?? orderCur).trim() || orderCur;
        productsRefundByCurrency[cur] = (productsRefundByCurrency[cur] ?? 0) + amt;
      }
    }
  }

  const shippingRefundByCurrency: Record<string, number> = {};
  const includesShippingRefund = hasSavedProductRefund && shippingCost > 0;
  if (includesShippingRefund) {
    shippingRefundByCurrency[orderCur] = (shippingRefundByCurrency[orderCur] ?? 0) + shippingCost;
  }

  const finalTotalByCurrency: Record<string, number> = {};
  const add = (src: Record<string, number>) => {
    for (const [c, v] of Object.entries(src)) {
      if (v > 0) finalTotalByCurrency[c] = (finalTotalByCurrency[c] ?? 0) + v;
    }
  };
  add(productsRefundByCurrency);
  add(shippingRefundByCurrency);

  return {
    productsRefundByCurrency,
    shippingRefundByCurrency,
    finalTotalByCurrency,
    refundLineCount,
    exchangeLineCount,
    rejectedLineCount,
    includesShippingRefund,
  };
}
