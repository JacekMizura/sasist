import type { FilterFieldCatalogItem } from "../filters/FilterVisibilityModal";

export const PRODUCT_PROFITABILITY_COLUMNS_LAYOUT_KEY = "products.profitability.columns_layout";

export const PRODUCT_PROFITABILITY_COLUMN_CATALOG: readonly FilterFieldCatalogItem[] = [
  { id: "sku", label: "SKU" },
  { id: "ean", label: "EAN" },
  { id: "stock", label: "Stan" },
  { id: "sold", label: "Sprzedano" },
  { id: "revenue_net", label: "Przychód netto" },
  { id: "cost_of_goods", label: "Koszt sprzedaży" },
  { id: "profit", label: "Zysk" },
  { id: "margin", label: "Marża" },
  { id: "sale_gross", label: "Cena sprzedaży brutto" },
  { id: "landed_cost_net", label: "Całkowity koszt netto" },
  { id: "warehouse_value", label: "Wartość magazynu" },
  { id: "frozen_capital", label: "Zamrożony kapitał" },
  { id: "last_sale", label: "Ostatnia sprzedaż" },
  { id: "last_purchase", label: "Ostatni zakup" },
] as const;

export const PRODUCT_PROFITABILITY_COLUMN_IDS = PRODUCT_PROFITABILITY_COLUMN_CATALOG.map((c) => c.id);

export const PRODUCT_PROFITABILITY_DEFAULT_COLUMN_ORDER: readonly string[] = [
  "sku",
  "stock",
  "sold",
  "revenue_net",
  "profit",
  "margin",
  "frozen_capital",
];

export function productProfitabilityColumnLabel(columnId: string): string {
  return PRODUCT_PROFITABILITY_COLUMN_CATALOG.find((c) => c.id === columnId)?.label ?? columnId;
}
