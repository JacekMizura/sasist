/** Centralized Polish labels for Sprzedaż stacjonarna. */

import { formatMoneyPl as formatMoneyPlCore } from "../../utils/formatOrderMoney";

export const STATIONARY_SALE_TITLE = "Sprzedaż stacjonarna";
export const STATIONARY_SALE_UNAVAILABLE = "Sprzedaż stacjonarna jest obecnie niedostępna.";
export const IMMEDIATE_ISSUE_LABEL = "Wydanie natychmiastowe";
export const RETAIL_CUSTOMER_LABEL = "Klient detaliczny";
export const PICKUP_DELIVERY_LABEL = "Odbiór osobisty";

export function sessionStatusPl(status: string | null | undefined): string {
  switch (String(status ?? "").toUpperCase()) {
    case "ACTIVE":
      return "Aktywna";
    case "SUSPENDED":
      return "Zawieszona";
    case "CHECKOUT":
      return "Płatność";
    case "COMPLETED":
      return "Zakończona";
    case "CANCELLED":
      return "Anulowana";
    case "FAILED":
      return "Błąd";
    default:
      return status ? String(status) : "—";
  }
}

export type StockLevel = "ok" | "low" | "out";

export function resolveStockLevel(available: number | null | undefined, orderedQty: number): StockLevel {
  const avail = available ?? null;
  if (avail == null) return "ok";
  if (avail <= 0) return "out";
  if (avail < orderedQty || avail < 3) return "low";
  return "ok";
}

export const STOCK_BADGE: Record<StockLevel, { label: string; className: string }> = {
  ok: {
    label: "Dostępny",
    className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
  low: {
    label: "Niski stan",
    className: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  out: {
    label: "Brak",
    className: "bg-red-50 text-red-700 border border-red-200",
  },
};

export function paymentMethodPl(method: string | null | undefined): string {
  switch (String(method ?? "").toUpperCase()) {
    case "CASH":
      return "Gotówka";
    case "CARD":
      return "Karta";
    case "BLIK":
      return "BLIK";
    case "MIXED":
      return "Mieszana";
    case "TRANSFER":
      return "Przelew";
    default:
      return method ? String(method) : "—";
  }
}

export function paymentStatusPl(status: string | null | undefined): string {
  switch (String(status ?? "").toUpperCase()) {
    case "PAID":
    case "SETTLED":
    case "CAPTURED":
      return "Opłacone";
    case "PENDING":
      return "Oczekuje";
    case "FAILED":
      return "Nieudane";
    case "CANCELLED":
      return "Anulowane";
    case "REFUNDED":
      return "Zwrócone";
    default:
      return status ? String(status) : "—";
  }
}

export function documentSubtypePl(subtype: string | null | undefined): string {
  switch (String(subtype ?? "").toUpperCase()) {
    case "INVOICE":
    case "FV":
      return "Faktura";
    case "RECEIPT":
    case "PA":
    case "PARAGON":
      return "Paragon";
    case "WZ":
      return "WZ";
    default:
      return subtype ? String(subtype) : "—";
  }
}

export function documentStatusPl(status: string | null | undefined): string {
  switch (String(status ?? "").toUpperCase()) {
    case "PENDING":
    case "RETRYING":
      return "W kolejce";
    case "PROCESSING":
      return "Generowanie";
    case "GENERATED":
    case "COMPLETED":
    case "DONE":
      return "Gotowy";
    case "FAILED":
      return "Błąd";
    case "CANCELLED":
      return "Anulowany";
    default:
      return status ? String(status) : "—";
  }
}

export function fiscalStatusPl(status: string | null | undefined): string {
  switch (String(status ?? "").toUpperCase()) {
    case "PENDING":
      return "Oczekuje na fiskalizację";
    case "SENT":
      return "Wysłano do kasy";
    case "ACCEPTED":
      return "Zafiskalizowano";
    case "FAILED":
      return "Błąd fiskalizacji";
    default:
      return status ? String(status) : "—";
  }
}

export function printButtonLabelPl(subtype: string | null | undefined): string {
  const s = String(subtype ?? "").toUpperCase();
  if (s === "INVOICE" || s === "FV") return "Drukuj fakturę";
  if (s === "RECEIPT" || s === "PA") return "Drukuj paragon";
  if (s === "WZ") return "Drukuj WZ";
  return "Drukuj dokument";
}

export function formatMoneyPl(amount: number | null | undefined, currency = "zł"): string {
  return formatMoneyPlCore(amount, { currency });
}

export function isStationarySaleOrder(order: {
  order_channel?: string | null;
  source?: string | null;
} | null | undefined): boolean {
  if (!order) return false;
  const ch = String(order.order_channel ?? "").trim().toUpperCase();
  if (ch === "DIRECT_SALE") return true;
  const src = String(order.source ?? "").trim().toLowerCase();
  return src === "direct-sales" || src === "direct_sales" || src === "sprzedaż stacjonarna";
}

export function formatAgeMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
