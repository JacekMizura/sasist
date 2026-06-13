import type { ColumnCatalogItem } from "../../components/columnPicker";
import type { TenantWarehouseAssignment } from "../../services/warehouseService";

export const PRODUCT_NETWORK_STOCK_COLUMN_ID = "network_stock";

export function warehouseStockColumnId(warehouseId: number): string {
  return `warehouse_stock_${warehouseId}`;
}

export function parseWarehouseStockColumnId(colId: string): number | null {
  if (!colId.startsWith("warehouse_stock_")) return null;
  const n = Number(colId.slice("warehouse_stock_".length));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function buildProductListColumnCatalog(
  assignments: TenantWarehouseAssignment[],
  warehouseNames: Map<number, string>,
): ColumnCatalogItem[] {
  const base: ColumnCatalogItem[] = [
    { id: "photo", label: "Zdjęcie" },
    { id: "name", label: "Nazwa" },
    { id: "ean_sku", label: "EAN / SKU" },
    { id: "supplier", label: "Dostawca" },
    { id: "manufacturer", label: "Producent" },
    { id: "price", label: "Cena" },
    { id: "purchase_price", label: "Cena zakupu" },
    { id: "dimensions", label: "Wymiary" },
    { id: "stock", label: "Stan" },
    { id: PRODUCT_NETWORK_STOCK_COLUMN_ID, label: "Stan sieciowy" },
    { id: "inventory_value", label: "Wartość mag." },
    { id: "locations", label: "Lokalizacje" },
  ];

  const whCols: ColumnCatalogItem[] = assignments
    .filter((a) => a.tenant_id > 0)
    .map((a) => ({
      id: warehouseStockColumnId(a.warehouse_id),
      label: `Stan ${warehouseNames.get(a.warehouse_id) ?? `Magazyn #${a.warehouse_id}`}`,
    }));

  return [...base, ...whCols];
}

export const PRODUCT_LIST_DEFAULT_TABLE_COLUMN_ORDER = [
  "photo",
  "name",
  "ean_sku",
  "price",
  "stock",
  PRODUCT_NETWORK_STOCK_COLUMN_ID,
  "inventory_value",
  "locations",
];

export function productListNeedsNetworkStock(columns: string[]): boolean {
  return columns.includes(PRODUCT_NETWORK_STOCK_COLUMN_ID);
}

export function productListNeedsWarehouseStocks(columns: string[]): boolean {
  return columns.some((c) => c.startsWith("warehouse_stock_"));
}
