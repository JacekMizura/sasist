/** Canonical bundle operational mode (P4.11) — język operacyjny, nie techniczny. */
export type BundleOperationalMode = "ON_DEMAND_ASSEMBLY" | "STOCK_PRODUCTION";

export const BUNDLE_OPERATIONAL_MODE_LABEL: Record<BundleOperationalMode, string> = {
  ON_DEMAND_ASSEMBLY: "Kompletowany na zamówienie",
  STOCK_PRODUCTION: "Produkowany / konfekcjonowany na magazyn",
};

export const BUNDLE_OPERATIONAL_MODE_SHORT: Record<BundleOperationalMode, string> = {
  ON_DEMAND_ASSEMBLY: "Kompletacja na zamówienie",
  STOCK_PRODUCTION: "Produkcja na magazyn",
};

export const BUNDLE_OPERATIONAL_MODE_DESCRIPTION: Record<BundleOperationalMode, string> = {
  ON_DEMAND_ASSEMBLY:
    "Stan wyliczany ze składników. Towar kompletowany dopiero podczas realizacji zamówienia.",
  STOCK_PRODUCTION:
    "Gotowy zestaw posiada własny stan magazynowy i jest magazynowany jak osobny produkt.",
};

/** @deprecated Use BundleOperationalMode */
export type BundleFulfillmentMode = "assembly" | "manufacturing";
/** @deprecated Use BundleOperationalMode */
export type BundleStockMode = "physical" | "virtual";

export function normalizeBundleOperationalMode(
  raw: unknown,
  legacy?: { stock_mode?: unknown; fulfillment_mode?: unknown },
): BundleOperationalMode {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
  if (s === "ON_DEMAND_ASSEMBLY" || s === "ON_DEMAND") return "ON_DEMAND_ASSEMBLY";
  if (s === "STOCK_PRODUCTION" || s === "STOCK") return "STOCK_PRODUCTION";

  const sm = String(legacy?.stock_mode ?? "")
    .trim()
    .toLowerCase();
  if (sm === "physical") return "STOCK_PRODUCTION";
  if (sm === "virtual") return "ON_DEMAND_ASSEMBLY";

  const fm = String(legacy?.fulfillment_mode ?? "")
    .trim()
    .toLowerCase();
  if (fm === "manufacturing") return "STOCK_PRODUCTION";
  return "ON_DEMAND_ASSEMBLY";
}

export function isOnDemandAssembly(mode: BundleOperationalMode): boolean {
  return mode === "ON_DEMAND_ASSEMBLY";
}

export function isStockProduction(mode: BundleOperationalMode): boolean {
  return mode === "STOCK_PRODUCTION";
}
