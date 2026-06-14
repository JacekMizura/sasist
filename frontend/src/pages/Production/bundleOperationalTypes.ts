export type BundleFulfillmentMode = "assembly" | "manufacturing";
export type BundleStockMode = "physical" | "virtual";

export const BUNDLE_FULFILLMENT_LABEL: Record<BundleFulfillmentMode, string> = {
  assembly: "Kompletacja",
  manufacturing: "Produkcja",
};

export const BUNDLE_STOCK_MODE_LABEL: Record<BundleStockMode, string> = {
  physical: "Zestaw fizyczny",
  virtual: "Zestaw wirtualny",
};

export const BUNDLE_TYPE_HEADER_LABEL: Record<BundleStockMode, string> = {
  physical: "Zestaw fizyczny",
  virtual: "Zestaw wirtualny",
};

export function normalizeFulfillmentMode(v: unknown): BundleFulfillmentMode {
  const s = String(v ?? "assembly").toLowerCase();
  return s === "manufacturing" ? "manufacturing" : "assembly";
}

export function normalizeStockMode(v: unknown): BundleStockMode {
  const s = String(v ?? "virtual").toLowerCase();
  return s === "physical" ? "physical" : "virtual";
}
