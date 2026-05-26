import type { InventoryRow } from "../../../../pages/WarehouseDesigner/inventoryMaps";

type ProductPrice = { id: string; purchase_price?: number };

/**
 * Σ (quantity × purchase_price) for inventory rows whose location_uuid is in the warehouse layout.
 */
export function computeWarehouseInventoryValuePln(
  products: ProductPrice[],
  inventoryRows: InventoryRow[],
  layoutLocationUuids: Set<string>
): number {
  const priceByProductId = new Map<string, number>();
  for (const p of products) {
    const pid = String(p.id);
    const pr = typeof p.purchase_price === "number" && Number.isFinite(p.purchase_price) ? p.purchase_price : 0;
    priceByProductId.set(pid, pr);
  }
  let sum = 0;
  for (const row of inventoryRows) {
    const u = (row.location_uuid ?? "").trim();
    if (!u || !layoutLocationUuids.has(u)) continue;
    const qty = typeof row.quantity === "number" && row.quantity > 0 ? row.quantity : 0;
    if (qty <= 0) continue;
    const pid = String(row.product_id);
    const price = priceByProductId.get(pid) ?? 0;
    sum += qty * price;
  }
  return sum;
}
