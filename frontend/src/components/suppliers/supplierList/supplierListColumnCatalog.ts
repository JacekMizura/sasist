import type { FilterFieldCatalogItem } from "../../filters/FilterVisibilityModal";

export const SUPPLIERS_LIST_COLUMNS_LAYOUT_KEY = "suppliers_list_columns_layout";

/** Kolumny konfigurowalne — Nazwa jest kolumną systemową. */
export const SUPPLIER_LIST_COLUMN_CATALOG: readonly FilterFieldCatalogItem[] = [
  { id: "country", label: "Kraj" },
  { id: "city", label: "Miasto" },
  { id: "email", label: "E-mail" },
  { id: "phone", label: "Telefon" },
  { id: "currency", label: "Waluta" },
  { id: "shipping", label: "Wysyłka" },
  { id: "moq", label: "MOQ" },
  { id: "products", label: "Produkty" },
  { id: "orders", label: "Zamówienia" },
  { id: "status", label: "Status" },
] as const;

export const SUPPLIER_LIST_COLUMN_IDS = SUPPLIER_LIST_COLUMN_CATALOG.map((c) => c.id);

export const SUPPLIER_LIST_DEFAULT_COLUMN_ORDER: readonly string[] = [
  "currency",
  "shipping",
  "moq",
  "orders",
  "status",
];

export function supplierListColumnLabel(columnId: string): string {
  return SUPPLIER_LIST_COLUMN_CATALOG.find((c) => c.id === columnId)?.label ?? columnId;
}
