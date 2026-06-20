import type { FilterFieldCatalogItem } from "../../filters/FilterVisibilityModal";

export const PACKAGING_LIST_COLUMNS_LAYOUT_KEY = "warehouse_materials.packaging.columns_layout";

export const PACKAGING_LIST_COLUMN_CATALOG: readonly FilterFieldCatalogItem[] = [
  { id: "sku", label: "SKU" },
  { id: "type", label: "Typ" },
  { id: "unit", label: "Jednostka" },
  { id: "stock", label: "Stan" },
  { id: "net_price", label: "Netto / j.u." },
  { id: "gross_price", label: "Brutto / j.u." },
  { id: "supplier", label: "Dostawca" },
  { id: "status", label: "Status" },
  { id: "moq", label: "MOQ" },
] as const;

export const PACKAGING_LIST_COLUMN_IDS = PACKAGING_LIST_COLUMN_CATALOG.map((c) => c.id);

export const PACKAGING_LIST_DEFAULT_COLUMN_ORDER: readonly string[] = [
  "sku",
  "type",
  "stock",
  "net_price",
  "supplier",
  "status",
];

export function packagingListColumnLabel(columnId: string): string {
  return PACKAGING_LIST_COLUMN_CATALOG.find((c) => c.id === columnId)?.label ?? columnId;
}
