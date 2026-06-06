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
  ok: { label: "Dostępny", className: "bg-emerald-100 text-emerald-800" },
  low: { label: "Niski stan", className: "bg-amber-100 text-amber-900" },
  out: { label: "Brak", className: "bg-red-100 text-red-800" },
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
    default:
      return method ? String(method) : "—";
  }
}

export function formatAgeMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
