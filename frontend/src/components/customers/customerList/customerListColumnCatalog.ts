import type { FilterFieldCatalogItem } from "../../filters/FilterVisibilityModal";

export const CUSTOMERS_LIST_COLUMNS_LAYOUT_KEY = "customers_list_columns_layout";

export const CUSTOMER_LIST_COLUMN_CATALOG: readonly FilterFieldCatalogItem[] = [
  { id: "id", label: "ID" },
  { id: "client", label: "Imię i nazwisko / Firma" },
  { id: "customer_type", label: "Typ klienta" },
  { id: "sales_channel", label: "Kanał" },
  { id: "email", label: "E-mail" },
  { id: "phone", label: "Telefon" },
  { id: "nip", label: "NIP" },
  { id: "country", label: "Kraj" },
  { id: "created_at", label: "Data utworzenia" },
  { id: "last_purchase", label: "Ostatni zakup" },
  { id: "orders", label: "Zamówienia" },
  { id: "returns", label: "Zwroty / korekty" },
  { id: "total_net", label: "Obrót netto" },
  { id: "total_gross", label: "Obrót brutto" },
  { id: "global_discount", label: "Rabat globalny" },
] as const;

export const CUSTOMER_LIST_COLUMN_IDS = CUSTOMER_LIST_COLUMN_CATALOG.map((c) => c.id);

export const CUSTOMER_LIST_DEFAULT_COLUMN_ORDER: readonly string[] = [
  "id",
  "client",
  "customer_type",
  "sales_channel",
  "email",
  "phone",
  "nip",
  "country",
];

export function customerListColumnLabel(columnId: string): string {
  return CUSTOMER_LIST_COLUMN_CATALOG.find((c) => c.id === columnId)?.label ?? columnId;
}

/** Szerokości kolumn w tabeli (colgroup). */
export const CUSTOMER_LIST_COLUMN_WIDTH: Record<string, string> = {
  id: "72px",
  client: "22%",
  customer_type: "12%",
  sales_channel: "14%",
  email: "16%",
  phone: "11%",
  nip: "11%",
  country: "8%",
  created_at: "10%",
  last_purchase: "10%",
  orders: "8%",
  returns: "10%",
  total_net: "10%",
  total_gross: "10%",
  global_discount: "9%",
};
