import type { ComplaintLineDetail } from "../../types/complaint";

export type LineOpKey =
  | "pickup"
  | "warehouse_in"
  | "service_sent"
  | "repair_done"
  | "shipped_customer"
  | "order_placed"
  | "ship_out"
  | "return_customer"
  | "refund_done";

export type ComplaintLineFlow = "repair" | "exchange" | "reject" | "refund";

/** Akcje PATCH /complaint-lines/:id/operation (mapowane w backendzie na operation_status). */
export type ComplaintLineOperationAction =
  | "CUSTOMER_PICKUP"
  | "PICKUP"
  | "WAREHOUSE_RECEIVED"
  | "RECEIVED"
  | "SENT_TO_SERVICE"
  | "REPAIR_COMPLETED"
  | "SHIPPED_TO_CUSTOMER"
  | "EXCHANGE_ORDER_PLACED"
  | "OUTBOUND_SHIPPED"
  | "RETURNED_TO_CUSTOMER"
  | "REFUND_COMPLETED";

const LINE_KEY_TO_API_ACTION: Record<LineOpKey, ComplaintLineOperationAction> = {
  pickup: "CUSTOMER_PICKUP",
  warehouse_in: "WAREHOUSE_RECEIVED",
  service_sent: "SENT_TO_SERVICE",
  repair_done: "REPAIR_COMPLETED",
  shipped_customer: "SHIPPED_TO_CUSTOMER",
  order_placed: "EXCHANGE_ORDER_PLACED",
  ship_out: "OUTBOUND_SHIPPED",
  return_customer: "RETURNED_TO_CUSTOMER",
  refund_done: "REFUND_COMPLETED",
};

export function lineOpKeyToApiAction(key: LineOpKey): ComplaintLineOperationAction {
  return LINE_KEY_TO_API_ACTION[key];
}

export type LineExchangeKind = "EXCHANGE" | "REPLACEMENT";

export const LINE_OP_CHAIN: Record<ComplaintLineFlow, readonly LineOpKey[]> = {
  repair: ["pickup", "warehouse_in", "service_sent", "repair_done", "shipped_customer"],
  exchange: [],
  reject: ["pickup", "return_customer"],
  refund: ["pickup", "warehouse_in", "refund_done"],
};

/** Łańcuch operacji — przy wymianie wymaga exchange_kind z API. */
export function lineOpChainForDecision(
  decision: ComplaintLineFlow,
  exchangeKind: LineExchangeKind | null | undefined,
): readonly LineOpKey[] {
  if (decision === "exchange") {
    if (exchangeKind === "REPLACEMENT") return ["order_placed", "ship_out"];
    if (exchangeKind === "EXCHANGE") return ["pickup", "order_placed", "ship_out"];
    return [];
  }
  if (decision === "refund") return LINE_OP_CHAIN.refund;
  return LINE_OP_CHAIN[decision];
}

export const LINE_OP_BUTTON_LABEL_PL: Record<LineOpKey, string> = {
  pickup: "Potwierdź etap: odbiór zamówiony",
  warehouse_in: "Przyjęto na magazyn",
  service_sent: "Potwierdź: wysłano do serwisu",
  repair_done: "Zakończ naprawę",
  shipped_customer: "Potwierdź: wysłano do klienta",
  order_placed: "Potwierdź: zamówienie utworzone",
  ship_out: "Wysyłka do klienta — oznacz",
  return_customer: "Zwrot do klienta — oznacz",
  refund_done: "Zwrot środków — zakończ etap",
};

export const LINE_OP_TIMELINE_LABEL_PL: Record<LineOpKey, string> = {
  pickup: "Krok 1 — Odbiór od klienta",
  warehouse_in: "Krok 2 — Przyjęcie na magazyn",
  service_sent: "Krok 3 — Obsługa serwisowa",
  repair_done: "Krok 4 — Zakończenie naprawy",
  shipped_customer: "Krok 5 — Nadanie do klienta",
  order_placed: "Generuj zamówienie",
  ship_out: "Wyślij do klienta",
  return_customer: "Zwrot do klienta",
  refund_done: "Krok 3 — Rozliczenie zwrotu",
};

export function lineOperationIndex(chain: readonly LineOpKey[], operationStatus: string | null | undefined): number {
  const cur = String(operationStatus ?? "")
    .trim()
    .toLowerCase();
  if (!cur) return -1;
  const i = chain.indexOf(cur as LineOpKey);
  return i >= 0 ? i : -1;
}

export function nextLineOperationKey(chain: readonly LineOpKey[], operationStatus: string | null | undefined): LineOpKey | null {
  const idx = lineOperationIndex(chain, operationStatus);
  const next = idx + 1;
  if (next >= chain.length) return null;
  return chain[next] as LineOpKey;
}

function normExchangeKind(raw: string | null | undefined): LineExchangeKind | null {
  const u = String(raw ?? "").toUpperCase();
  if (u === "EXCHANGE" || u === "REPLACEMENT") return u;
  return null;
}

/** Komunikat blokady przejścia na Zaakceptowana / Odrzucona. */
export const COMPLAINT_FINAL_DECISION_BLOCK_MSG =
  "Aby zamknąć reklamację: każda pozycja musi mieć decyzję i ukończone operacje";

export type ComplaintCloseBlockingReason = "missing_decision" | "incomplete_operations";

export type ComplaintCloseBlockingLine = {
  lineId: number;
  productLabel: string;
  reason: ComplaintCloseBlockingReason;
};

const LINE_DECISIONS_ALLOWED = new Set(["repair", "exchange", "reject", "refund"]);

function complaintLineProductLabel(line: ComplaintLineDetail): string {
  const name = (line.product_name ?? "").trim();
  if (name) return `${name} (#${line.id})`;
  return `Pozycja #${line.id}`;
}

/** Decyzja ustawiona i łańcuch operacji zakończony (ostatni krok operation_status). */
export function lineOperationsCompleteForFinalDecision(line: ComplaintLineDetail): boolean {
  const d = String(line.decision ?? "").trim().toLowerCase();
  if (d !== "repair" && d !== "exchange" && d !== "reject" && d !== "refund") return false;
  const chain = lineOpChainForDecision(d as ComplaintLineFlow, normExchangeKind(line.exchange_kind));
  if (chain.length === 0) return false;
  const idxLast = lineOperationIndex(chain, line.operation_status);
  const nextKey = nextLineOperationKey(chain, line.operation_status);
  return nextKey === null && idxLast >= 0;
}

/** Pozycje blokujące zamknięcie reklamacji (UX — spójnie z lineOperationsCompleteForFinalDecision). */
export function getComplaintCloseBlockingLines(
  lines: ComplaintLineDetail[] | null | undefined,
): ComplaintCloseBlockingLine[] {
  const list = lines ?? [];
  const out: ComplaintCloseBlockingLine[] = [];
  for (const ln of list) {
    const d = String(ln.decision ?? "").trim().toLowerCase();
    if (!LINE_DECISIONS_ALLOWED.has(d)) {
      out.push({
        lineId: ln.id,
        productLabel: complaintLineProductLabel(ln),
        reason: "missing_decision",
      });
      continue;
    }
    if (lineOperationsCompleteForFinalDecision(ln)) continue;
    out.push({
      lineId: ln.id,
      productLabel: complaintLineProductLabel(ln),
      reason: "incomplete_operations",
    });
  }
  return out;
}

export function complaintLinesReadyForFinalDecision(lines: ComplaintLineDetail[] | null | undefined): boolean {
  const list = lines ?? [];
  if (list.length === 0) return false;
  return list.every((ln) => lineOperationsCompleteForFinalDecision(ln));
}
