/**
 * WMS inventory execution — location → carrier → product hierarchy.
 */

/** Aggregated counted product — one row per line_id (location × carrier × product). */
export type WmsCountedProduct = {
  line_id: number;
  product_id: number | null;
  product_name: string | null;
  sku?: string | null;
  ean?: string | null;
  image_url?: string | null;
  carrier_id?: number | null;
  carrier_code?: string | null;
  counted_quantity: number;
  updatedAt: number;
  scan: import("@/api/inventoryCountApi").WmsBarcodeResolveResult;
  defectReported?: boolean;
  defectNote?: string | null;
};

/** Unknown product draft at location — from execution summary. */
export type WmsUnexpectedProduct = {
  unknown_id: number;
  temporary_name: string;
  barcode_value?: string | null;
  quantity: number;
  updatedAt: number;
};

export type WmsQtyInputMode = "unit" | "carton";

export type WmsInventoryPackaging = {
  unitsPerCarton: number;
  cartonEan: string | null;
};

export const CARRIER_BARCODE_PREFIXES = ["PAL-", "BOX-", "BIN-", "CRT-", "MIX-"] as const;

export type WmsLocationContext = {
  locationId: number;
  locationCode: string;
  taskId: number;
  confirmed: boolean;
};

export type WmsCarrierContext = {
  carrierId: number;
  code: string;
} | null;

export type WmsCountedCarrierGroup = {
  key: string;
  carrierId: number | null;
  carrierCode: string | null;
  items: WmsCountedProduct[];
};

export function isCarrierBarcode(code: string): boolean {
  const t = code.trim().toUpperCase();
  if (!t) return false;
  return CARRIER_BARCODE_PREFIXES.some((p) => t.startsWith(p));
}

export function locationCodesMatch(taskCode: string | null | undefined, scanned: string): boolean {
  const norm = (v: string) => v.trim().toUpperCase();
  const target = norm(scanned);
  if (!target) return false;
  const candidates = [taskCode, String(taskCode ?? "").replace(/\s+/g, "")]
    .filter(Boolean)
    .map((c) => norm(String(c)));
  return candidates.some((c) => c === target || target.includes(c) || c.includes(target));
}

export function buildLocationContextFromTask(
  task: { id: number; location_id: number; location_code?: string | null; location_name?: string | null },
  confirmed = true,
): WmsLocationContext {
  return {
    taskId: task.id,
    locationId: task.location_id,
    locationCode: task.location_code ?? task.location_name ?? `#${task.location_id}`,
    confirmed,
  };
}

/** Group counted lines: carriers first (sorted), then location root (bez nośnika). */
export function groupCountedProductsByCarrier(items: WmsCountedProduct[]): WmsCountedCarrierGroup[] {
  const byKey = new Map<string, WmsCountedCarrierGroup>();

  for (const item of items) {
    const carrierId = item.carrier_id ?? null;
    const carrierCode = item.carrier_code ?? null;
    const key = carrierId != null ? `c-${carrierId}` : "root";
    const existing = byKey.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      byKey.set(key, {
        key,
        carrierId,
        carrierCode,
        items: [item],
      });
    }
  }

  for (const group of byKey.values()) {
    group.items.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  const carriers = [...byKey.values()]
    .filter((g) => g.carrierId != null)
    .sort((a, b) => String(a.carrierCode ?? "").localeCompare(String(b.carrierCode ?? ""), "pl"));
  const root = byKey.get("root");
  return root ? [...carriers, root] : carriers;
}
