/** Read-only disposition pools from GET /products (Etap 1 — additive API). */
export type ProductDispositionStock = {
  saleable_qty: number;
  outlet_qty: number;
  service_qty: number;
  quarantine_qty: number;
  scrap_qty: number;
  rejected_qty: number;
  other_qty: number;
  physical_qty: number;
  saleable_available_qty: number;
};

export const EMPTY_DISPOSITION_STOCK: ProductDispositionStock = {
  saleable_qty: 0,
  outlet_qty: 0,
  service_qty: 0,
  quarantine_qty: 0,
  scrap_qty: 0,
  rejected_qty: 0,
  other_qty: 0,
  physical_qty: 0,
  saleable_available_qty: 0,
};

/** Future Etap 2: OrderItem.required_stock_disposition will use these codes. */
export const CANONICAL_STOCK_DISPOSITIONS = [
  "SALEABLE",
  "OUTLET_B",
  "SERVICE_C",
  "QUARANTINE",
  "SCRAP",
  "REJECTED_STOCK",
] as const;

export type CanonicalStockDisposition = (typeof CANONICAL_STOCK_DISPOSITIONS)[number];

export function parseDispositionStock(raw: unknown): ProductDispositionStock | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const num = (k: string) => {
    const v = o[k];
    return v != null && Number.isFinite(Number(v)) ? Number(v) : 0;
  };
  return {
    saleable_qty: num("saleable_qty"),
    outlet_qty: num("outlet_qty"),
    service_qty: num("service_qty"),
    quarantine_qty: num("quarantine_qty"),
    scrap_qty: num("scrap_qty"),
    rejected_qty: num("rejected_qty"),
    other_qty: num("other_qty"),
    physical_qty: num("physical_qty"),
    saleable_available_qty: num("saleable_available_qty"),
  };
}

export function fmtDispositionQty(n: number): string {
  const r = Math.round(n);
  if (Math.abs(n - r) < 1e-9) return String(r);
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}
