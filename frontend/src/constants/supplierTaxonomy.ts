/**
 * Must match backend `catalog/supplier_taxonomy.py` (validated on API).
 * For runtime fetch use GET /suppliers/taxonomy if you need server as source of truth.
 */
export const SUPPLIER_COUNTRIES: { value: string; label: string; isEu: boolean }[] = [
  { value: "Polska", label: "Polska", isEu: true },
  { value: "Niemcy", label: "Niemcy", isEu: true },
  { value: "Francja", label: "Francja", isEu: true },
  { value: "Czechy", label: "Czechy", isEu: true },
  { value: "Anglia", label: "Anglia", isEu: false },
  { value: "Hiszpania", label: "Hiszpania", isEu: true },
  { value: "Chiny", label: "Chiny", isEu: false },
];

export const SUPPLIER_COUNTRY_VALUES = new Set(SUPPLIER_COUNTRIES.map((c) => c.value));

export const SUPPLIER_CURRENCIES = ["EUR", "DOL", "CNY", "CZK", "PLN"] as const;
export type SupplierCurrencyCode = (typeof SUPPLIER_CURRENCIES)[number];

export function isEuCountryLabel(country: string | null | undefined): boolean | null {
  if (country == null || !String(country).trim()) return null;
  const row = SUPPLIER_COUNTRIES.find((c) => c.value === country.trim());
  return row ? row.isEu : null;
}
