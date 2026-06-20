import type { FilterFieldCatalogItem } from "../../filters/FilterVisibilityModal";

export const CARTONS_LIST_COLUMNS_LAYOUT_KEY = "warehouse_materials.cartons.columns_layout";

export const CARTONS_LIST_COLUMN_CATALOG: readonly FilterFieldCatalogItem[] = [
  { id: "sku", label: "SKU" },
  { id: "dimensions", label: "Wymiary" },
  { id: "stock", label: "Stan" },
  { id: "net_price", label: "Netto / szt." },
  { id: "gross_price", label: "Brutto / szt." },
  { id: "moq", label: "MOQ" },
  { id: "last_purchase", label: "Ostatnia cena netto" },
  { id: "supplier", label: "Dostawca" },
  { id: "status", label: "Status" },
  { id: "material_type", label: "Rodzaj materiału" },
  { id: "shipping", label: "Metody dostawy" },
] as const;

export const CARTONS_LIST_COLUMN_IDS = CARTONS_LIST_COLUMN_CATALOG.map((c) => c.id);

export const CARTONS_LIST_DEFAULT_COLUMN_ORDER: readonly string[] = [
  "sku",
  "dimensions",
  "stock",
  "net_price",
  "supplier",
  "status",
];

export function cartonsListColumnLabel(columnId: string): string {
  return CARTONS_LIST_COLUMN_CATALOG.find((c) => c.id === columnId)?.label ?? columnId;
}
