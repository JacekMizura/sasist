import type { FilterFieldCatalogItem } from "../../filters/FilterVisibilityModal";

export const MANUFACTURERS_LIST_COLUMNS_LAYOUT_KEY = "manufacturers_list_columns_layout";

export const MANUFACTURER_LIST_COLUMN_CATALOG: readonly FilterFieldCatalogItem[] = [
  { id: "logo", label: "Logo" },
  { id: "name", label: "Nazwa" },
  { id: "country", label: "Kraj" },
  { id: "status", label: "Status" },
  { id: "products", label: "Produkty" },
  { id: "phone", label: "Telefon" },
  { id: "email", label: "E-mail" },
  { id: "suppliers", label: "Dostawcy" },
  { id: "nip", label: "NIP" },
  { id: "city", label: "Miasto" },
] as const;

export const MANUFACTURER_LIST_COLUMN_IDS = MANUFACTURER_LIST_COLUMN_CATALOG.map((c) => c.id);

export const MANUFACTURER_LIST_DEFAULT_COLUMN_ORDER: readonly string[] = [
  "logo",
  "name",
  "country",
  "products",
  "status",
];

export function manufacturerListColumnLabel(columnId: string): string {
  return MANUFACTURER_LIST_COLUMN_CATALOG.find((c) => c.id === columnId)?.label ?? columnId;
}
