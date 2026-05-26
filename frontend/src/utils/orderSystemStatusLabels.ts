/**
 * Etykiety PL dla legacy `orders.status` i typowych statusów systemowych —
 * lista zamówień nie powinna pokazywać surowych kodów EN.
 */

const ORDER_SYSTEM_STATUS_PL: Record<string, string> = {
  NEW: "Nowe",
  IN_PROGRESS: "W realizacji",
  PROCESSING: "W realizacji",
  DONE: "Zakończone",
  COMPLETED: "Zakończone",
  CLOSED: "Zamknięte",
  CANCELLED: "Anulowane",
  CANCELED: "Anulowane",
  WAITING: "Oczekuje",
  PENDING: "Oczekuje",
  ON_HOLD: "Wstrzymane",
  HOLD: "Wstrzymane",
  PACKING: "Pakowanie",
  PACKED: "Spakowane",
  SHIPPED: "Wysłane",
  DELIVERED: "Dostarczone",
  MISSING: "Braki",
  PICKING: "Zbieranie",
  READY_TO_PACK: "Gotowe do pakowania",
  READY_FOR_PACKING: "Gotowe do pakowania",
  NEEDS_DECISION: "Wymaga decyzji",
  NEEDS_ATTENTION: "Wymaga uwagi",
  REFUNDED: "Zwrócone",
  PARTIALLY_REFUNDED: "Częściowy zwrot",
  PAYMENT_PENDING: "Oczekuje na płatność",
  PAYMENT_WAITING: "Oczekuje na płatność",
  PAID: "Opłacone",
  UNPAID: "Nieopłacone",
  FULFILLED: "Zrealizowane",
  PARTIALLY_SHIPPED: "Częściowo wysłane",
  RETURNED: "Zwrócone",
  DRAFT: "Szkic",
  CONFIRMED: "Potwierdzone",
  SENT: "Wysłane",
  FAILED: "Błąd",
  ERROR: "Błąd",
};

export function orderListSystemStatusLabel(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "—";
  const k = s.toUpperCase();
  return ORDER_SYSTEM_STATUS_PL[k] ?? s;
}
