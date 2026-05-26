import {
  normalizeInventoryLocationUuid,
  type InventoryRow,
} from "../pages/WarehouseDesigner/inventoryMaps";
import type { InventoryValueMetrics, MetricsProductInput } from "./types";
import { layoutLocationUuidSet } from "./computeCapacity";
import type { LayoutState } from "../types/warehouse";

function priceByProductId(products: MetricsProductInput[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of products) {
    const pr =
      typeof p.purchase_price === "number" && Number.isFinite(p.purchase_price) ? p.purchase_price : 0;
    m.set(String(p.id), pr);
  }
  return m;
}

function safeQuantity(q: unknown): number {
  return typeof q === "number" && Number.isFinite(q) && q > 0 ? q : 0;
}

/**
 * Σ(quantity × purchase_price) over inventory rows whose location_uuid matches a layout bin UUID.
 * Assumption: each row is one stock line at one location; summing rows does not double-count bins
 * (same UUID may appear in multiple rows for different products — each line is independent).
 */
export function computeInventoryValue(
  layout: LayoutState,
  inventoryRows: InventoryRow[],
  products: MetricsProductInput[]
): InventoryValueMetrics {
  const layoutUuids = layoutLocationUuidSet(layout);
  const prices = priceByProductId(products);
  let totalValue = 0;
  let contributingRowCount = 0;
  const distinctLocations = new Set<string>();

  for (const row of inventoryRows) {
    const u = normalizeInventoryLocationUuid(row.location_uuid);
    if (!u || !layoutUuids.has(u)) continue;
    const qty = safeQuantity(row.quantity);
    if (qty <= 0) continue;
    const price = prices.get(String(row.product_id)) ?? 0;
    const line = qty * price;
    if (line <= 0) continue;
    totalValue += line;
    contributingRowCount += 1;
    distinctLocations.add(u);
  }

  return {
    totalValue,
    contributingRowCount,
    distinctLocationCount: distinctLocations.size,
  };
}
