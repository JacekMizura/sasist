import { useCallback, useState } from "react";

import {
  searchWmsInventory,
  searchWmsTaskProducts,
  type InventoryUniversalSearchResult,
} from "@/api/inventoryCountApi";

export type LiveSearchPick =
  | { kind: "product"; scanCode: string }
  | { kind: "location"; locationCode: string; taskId?: number | null }
  | { kind: "carrier"; code: string };

export type LiveSearchRow = LiveSearchPick & {
  key: string;
  label: string;
  sub?: string;
  image_url?: string | null;
};

export function buildLiveSearchRows(
  result: InventoryUniversalSearchResult | null,
  taskMatches: Array<{ product_id: number; counted_quantity: number | null; image_url?: string | null }>,
): { products: LiveSearchRow[]; locations: LiveSearchRow[]; carriers: LiveSearchRow[] } {
  if (!result) return { products: [], locations: [], carriers: [] };
  const qtyByProduct = new Map(taskMatches.map((m) => [m.product_id, m.counted_quantity]));
  const imageByProduct = new Map(taskMatches.map((m) => [m.product_id, m.image_url]));
  const products: LiveSearchRow[] = [];
  const locations: LiveSearchRow[] = [];
  const carriers: LiveSearchRow[] = [];

  for (const p of result.products) {
    const counted = qtyByProduct.get(p.product_id);
    products.push({
      kind: "product",
      scanCode: p.ean ?? p.sku ?? String(p.product_id),
      key: `p-${p.product_id}`,
      label: p.name ?? p.sku ?? `#${p.product_id}`,
      sub: [p.ean, p.sku, counted != null ? `×${counted}` : null].filter(Boolean).join(" · "),
      image_url: p.image_url ?? imageByProduct.get(p.product_id),
    });
  }
  for (const loc of result.locations) {
    if (loc.zone === "nośnik") {
      carriers.push({
        kind: "carrier",
        code: loc.location_code,
        key: `c-${loc.carrier_id}-${loc.location_code}`,
        label: loc.location_code,
      });
    } else {
      const task = result.tasks.find((t) => t.location_id === loc.location_id);
      locations.push({
        kind: "location",
        locationCode: loc.location_code,
        taskId: task?.task_id ?? null,
        key: `l-${loc.location_id}`,
        label: loc.location_code,
        sub: [loc.zone, loc.aisle].filter(Boolean).join(" · ") || undefined,
      });
    }
  }
  return { products, locations, carriers };
}

export function pickFirstLiveSearch(rows: {
  products: LiveSearchRow[];
  locations: LiveSearchRow[];
  carriers: LiveSearchRow[];
}): LiveSearchPick | null {
  const first = rows.products[0] ?? rows.locations[0] ?? rows.carriers[0];
  if (!first) return null;
  if (first.kind === "product") return { kind: "product", scanCode: first.scanCode };
  if (first.kind === "location")
    return { kind: "location", locationCode: first.locationCode, taskId: first.taskId };
  return { kind: "carrier", code: first.code };
}

export function useWmsInventoryLiveSearch(
  tenantId: number,
  warehouseId: number,
  documentId?: number,
  taskId?: number,
) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InventoryUniversalSearchResult | null>(null);
  const [taskMatches, setTaskMatches] = useState<
    Array<{ product_id: number; counted_quantity: number | null; image_url?: string | null }>
  >([]);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setResult(null);
        setTaskMatches([]);
        return;
      }
      setLoading(true);
      try {
        const [data, taskData] = await Promise.all([
          searchWmsInventory(tenantId, warehouseId, trimmed, documentId),
          taskId ? searchWmsTaskProducts(tenantId, taskId, trimmed).catch(() => []) : Promise.resolve([]),
        ]);
        setResult(data);
        setTaskMatches(taskData);
      } catch {
        setResult(null);
        setTaskMatches([]);
      } finally {
        setLoading(false);
      }
    },
    [documentId, taskId, tenantId, warehouseId],
  );

  const clearSearch = useCallback(() => {
    setResult(null);
    setTaskMatches([]);
  }, []);

  return { loading, result, taskMatches, runSearch, clearSearch };
}
