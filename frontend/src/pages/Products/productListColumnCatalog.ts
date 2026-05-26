import type { ColumnCatalogItem } from "../../components/columnPicker";

export const PRODUCT_LIST_TABLE_COLUMN_CATALOG: ColumnCatalogItem[] = [
  { id: "photo", label: "Zdjęcie" },
  { id: "name", label: "Nazwa" },
  { id: "ean_sku", label: "EAN / SKU" },
  // Dodatkowe kolumny (opcjonalne) — konfigurator „Wybór kolumn”
  { id: "supplier", label: "Dostawca" },
  { id: "manufacturer", label: "Producent" },
  { id: "price", label: "Cena" },
  { id: "purchase_price", label: "Cena zakupu" },
  { id: "dimensions", label: "Wymiary" },
  { id: "stock", label: "Stan" },
  { id: "inventory_value", label: "Wartość mag." },
  { id: "locations", label: "Lokalizacje" },
];

export const PRODUCT_LIST_TABLE_CATALOG_IDS = PRODUCT_LIST_TABLE_COLUMN_CATALOG.map((c) => c.id);

export const PRODUCT_LIST_DEFAULT_TABLE_COLUMN_ORDER = [
  "photo",
  "name",
  "ean_sku",
  "price",
  "stock",
  "inventory_value",
  "locations",
];
