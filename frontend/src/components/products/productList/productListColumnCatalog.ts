import type { FilterFieldCatalogItem } from "../../filters";
import type { TenantWarehouseAssignment } from "../../../services/warehouseService";
import { PRODUCTS_COLUMNS_LAYOUT_KEY } from "../../../preferences/columnLayoutPreferences";

export { PRODUCTS_COLUMNS_LAYOUT_KEY };

export const PRODUCT_NETWORK_STOCK_COLUMN_ID = "network_stock";

export function warehouseStockColumnId(warehouseId: number): string {
  return `warehouse_stock_${warehouseId}`;
}

export function parseWarehouseStockColumnId(colId: string): number | null {
  if (!colId.startsWith("warehouse_stock_")) return null;
  const n = Number(colId.slice("warehouse_stock_".length));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Kolumny konfigurowalne — bez stałych: checkbox, zdjęcie, nazwa, akcje. */
const BASE_CONFIGURABLE_COLUMNS: FilterFieldCatalogItem[] = [
  { id: "sku", label: "SKU" },
  { id: "ean", label: "EAN" },
  { id: "price", label: "Cena" },
  { id: "stock", label: "Stan" },
  { id: PRODUCT_NETWORK_STOCK_COLUMN_ID, label: "Stan sieciowy" },
  { id: "inventory_value", label: "Wartość magazynu" },
  { id: "locations", label: "Lokalizacja" },
  { id: "manufacturer", label: "Producent" },
  { id: "category", label: "Kategoria" },
  { id: "status", label: "Status" },
  { id: "margin", label: "Marża" },
  { id: "created_at", label: "Data utworzenia" },
  { id: "last_sale", label: "Ostatnia sprzedaż" },
  { id: "last_purchase", label: "Ostatni zakup" },
  { id: "supplier", label: "Dostawca" },
  { id: "purchase_price", label: "Cena zakupu" },
  { id: "dimensions", label: "Wymiary" },
];

export function buildProductListColumnCatalog(
  assignments: TenantWarehouseAssignment[],
  warehouseNames: Map<number, string>,
): FilterFieldCatalogItem[] {
  const whCols: FilterFieldCatalogItem[] = assignments
    .filter((a) => a.tenant_id > 0)
    .map((a) => ({
      id: warehouseStockColumnId(a.warehouse_id),
      label: `Stan ${warehouseNames.get(a.warehouse_id) ?? `Magazyn #${a.warehouse_id}`}`,
    }));
  return [...BASE_CONFIGURABLE_COLUMNS, ...whCols];
}

export const PRODUCT_LIST_DEFAULT_COLUMN_ORDER = [
  "sku",
  "ean",
  "price",
  "stock",
  PRODUCT_NETWORK_STOCK_COLUMN_ID,
  "inventory_value",
  "locations",
  "manufacturer",
];

export function productListColumnLabel(columnId: string, catalog?: readonly FilterFieldCatalogItem[]): string {
  const fromCatalog = catalog?.find((c) => c.id === columnId)?.label;
  if (fromCatalog) return fromCatalog;
  switch (columnId) {
    case "sku":
      return "SKU";
    case "ean":
      return "EAN";
    case "price":
      return "Cena";
    case "stock":
      return "Stan";
    case PRODUCT_NETWORK_STOCK_COLUMN_ID:
      return "Stan sieciowy";
    case "inventory_value":
      return "Wartość magazynu";
    case "locations":
      return "Lokalizacja";
    case "manufacturer":
      return "Producent";
    case "category":
      return "Kategoria";
    case "status":
      return "Status";
    case "margin":
      return "Marża";
    case "created_at":
      return "Data utworzenia";
    case "last_sale":
      return "Ostatnia sprzedaż";
    case "last_purchase":
      return "Ostatni zakup";
    default:
      return columnId;
  }
}

export function migrateProductListColumnLayout(columns: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  for (const id of columns) {
    if (id === "photo" || id === "name") continue;
    if (id === "ean_sku") {
      push("sku");
      push("ean");
      continue;
    }
    push(id);
  }
  return out;
}

export function productListNeedsNetworkStock(columns: string[]): boolean {
  return columns.includes(PRODUCT_NETWORK_STOCK_COLUMN_ID);
}

export function productListNeedsWarehouseStocks(columns: string[]): boolean {
  return columns.some((c) => c.startsWith("warehouse_stock_"));
}

export function productListColumnIds(catalog: readonly FilterFieldCatalogItem[]): string[] {
  return catalog.map((c) => c.id);
}
