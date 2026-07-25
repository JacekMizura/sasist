/**
 * Magazyn designer SSOT: product ↔ location quantities.
 *
 * Rules:
 * 1. Inventory rows with qty > 0 win for (productId, locationUUID).
 * 2. assigned_locations fill gaps only when no inventory entry exists for that pair.
 * 3. Only layout location UUIDs are indexed (orphan UUIDs ignored for designer UI).
 *
 * All Magazyn UI (search qty, locator, sidebar, map highlights, occupancy) must read from here.
 */

import type { LayoutState, RackState, WarehouseProduct } from "../../types/warehouse";
import { activeBinsForRack } from "../../components/warehouse/warehouseUtils";
import { normalizeInventoryLocationUuid, type InventoryRow } from "./inventoryMaps";
import { safeQuantity, safeVolumeDm3 } from "./DesignerRackPlacement";

export type ProductLocationSource = "inventory" | "assigned";

export type ProductLocationEntry = {
  productId: string;
  locationUUID: string;
  quantity: number;
  source: ProductLocationSource;
  rackId: string;
};

export type ProductLocationIndex = {
  /** productId → locations with qty > 0 */
  byProduct: Map<string, ProductLocationEntry[]>;
  /** locationUUID → products with qty > 0 */
  byLocation: Map<string, ProductLocationEntry[]>;
  /** rackId → entries on that rack */
  byRack: Map<string, ProductLocationEntry[]>;
  /** layout UUIDs included in the index */
  layoutLocationUuids: ReadonlySet<string>;
};

export function binLocationUuid(bin: { locationUUID?: string; location_uuid?: string }): string {
  const u = bin.locationUUID ?? bin.location_uuid;
  return typeof u === "string" ? u.trim() : "";
}

export function assignedLocationUuid(a: {
  locationUUID?: string;
  location_uuid?: string;
}): string {
  if (typeof a.locationUUID === "string" && a.locationUUID.trim() !== "") return a.locationUUID.trim();
  if (typeof a.location_uuid === "string" && a.location_uuid.trim() !== "") return a.location_uuid.trim();
  return "";
}

function rackKey(r: Pick<RackState, "id" | "rack_index">): string {
  return String(r.id ?? r.rack_index);
}

function emptyIndex(layoutUuids: ReadonlySet<string>): ProductLocationIndex {
  return {
    byProduct: new Map(),
    byLocation: new Map(),
    byRack: new Map(),
    layoutLocationUuids: layoutUuids,
  };
}

function pushEntry(index: ProductLocationIndex, entry: ProductLocationEntry): void {
  const pArr = index.byProduct.get(entry.productId);
  if (pArr) pArr.push(entry);
  else index.byProduct.set(entry.productId, [entry]);

  const lArr = index.byLocation.get(entry.locationUUID);
  if (lArr) lArr.push(entry);
  else index.byLocation.set(entry.locationUUID, [entry]);

  const rArr = index.byRack.get(entry.rackId);
  if (rArr) rArr.push(entry);
  else index.byRack.set(entry.rackId, [entry]);
}

/**
 * Build SSOT index from inventory + assigned_locations.
 * Inventory wins per (productId, locationUUID); assigned fills gaps.
 */
export function buildProductLocationIndex(params: {
  layout: LayoutState;
  products: WarehouseProduct[];
  inventoryRows: InventoryRow[];
}): ProductLocationIndex {
  const { layout, products, inventoryRows } = params;

  const uuidToRack = new Map<string, string>();
  const layoutUuids = new Set<string>();
  for (const rack of layout.racks) {
    const rid = rackKey(rack);
    for (const bin of activeBinsForRack(rack)) {
      const u = normalizeInventoryLocationUuid(binLocationUuid(bin));
      if (!u) continue;
      layoutUuids.add(u);
      uuidToRack.set(u, rid);
    }
  }

  const index = emptyIndex(layoutUuids);
  /** productId|locationUUID already covered by inventory */
  const invPairs = new Set<string>();

  for (const row of inventoryRows) {
    const loc = normalizeInventoryLocationUuid(row.location_uuid);
    if (!loc || !layoutUuids.has(loc)) continue;
    const qty = safeQuantity(row.quantity);
    if (qty <= 0) continue;
    const productId = String(row.product_id);
    const rid = uuidToRack.get(loc);
    if (!rid) continue;
    const pair = `${productId}|${loc}`;
    if (invPairs.has(pair)) {
      // Aggregate duplicate inventory rows for same product+location
      const existing = index.byLocation.get(loc)?.find((e) => e.productId === productId);
      if (existing) {
        existing.quantity += qty;
        continue;
      }
    }
    invPairs.add(pair);
    pushEntry(index, {
      productId,
      locationUUID: loc,
      quantity: qty,
      source: "inventory",
      rackId: rid,
    });
  }

  for (const p of products) {
    if (!p.assignedLocations?.length) continue;
    for (const a of p.assignedLocations) {
      const loc = normalizeInventoryLocationUuid(assignedLocationUuid(a));
      if (!loc || !layoutUuids.has(loc)) continue;
      const qty = safeQuantity(a.quantity);
      if (qty <= 0) continue;
      const pair = `${p.id}|${loc}`;
      if (invPairs.has(pair)) continue;
      const rid = uuidToRack.get(loc);
      if (!rid) continue;
      pushEntry(index, {
        productId: p.id,
        locationUUID: loc,
        quantity: qty,
        source: "assigned",
        rackId: rid,
      });
    }
  }

  return index;
}

export function productQuantityInLayout(index: ProductLocationIndex, productId: string): number {
  const rows = index.byProduct.get(productId);
  if (!rows?.length) return 0;
  return rows.reduce((s, e) => s + e.quantity, 0);
}

export function productHasAnyLocation(index: ProductLocationIndex, productId: string): boolean {
  return (index.byProduct.get(productId)?.length ?? 0) > 0;
}

export function productIdsAtLocation(index: ProductLocationIndex, locationUUID: string): Set<string> {
  const u = normalizeInventoryLocationUuid(locationUUID);
  const set = new Set<string>();
  for (const e of index.byLocation.get(u) ?? []) set.add(e.productId);
  return set;
}

export function productIdsOnRack(index: ProductLocationIndex, rackId: string): Set<string> {
  const set = new Set<string>();
  for (const e of index.byRack.get(String(rackId)) ?? []) set.add(e.productId);
  return set;
}

export function locationUuidsForProduct(index: ProductLocationIndex, productId: string): Set<string> {
  const set = new Set<string>();
  for (const e of index.byProduct.get(productId) ?? []) set.add(e.locationUUID);
  return set;
}

export function rackIdsForProduct(index: ProductLocationIndex, productId: string): Set<string> {
  const set = new Set<string>();
  for (const e of index.byProduct.get(productId) ?? []) set.add(e.rackId);
  return set;
}

export function quantityByRackForProduct(
  index: ProductLocationIndex,
  productId: string
): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of index.byProduct.get(productId) ?? []) {
    map.set(e.rackId, (map.get(e.rackId) ?? 0) + e.quantity);
  }
  return map;
}

export function quantityAtLocationForProduct(
  index: ProductLocationIndex,
  productId: string,
  locationUUID: string
): number {
  const u = normalizeInventoryLocationUuid(locationUUID);
  let q = 0;
  for (const e of index.byProduct.get(productId) ?? []) {
    if (e.locationUUID === u) q += e.quantity;
  }
  return q;
}

export type RackOccupancyStats = {
  rackId: string;
  /** All storage locations on the rack (unique UUIDs / slots). */
  locationCount: number;
  /** Locations with qty > 0 (SSOT index). */
  occupiedLocations: number;
  freeLocations: number;
  /** occupied / locationCount × 100 (0–100). */
  occupancyPct: number;
  /** Precomputed fill color for the occupancy bar (threshold bands). */
  barColor: string;
  volumeUsedDm3: number;
  volumeCapacityDm3: number;
  /** null when capacity unknown / zero. */
  volumePct: number | null;
};

/** Occupancy bar colors: 0–60 green, 60–85 yellow, 85–95 orange, >95 red. */
export function occupancyBarColor(pct: number): string {
  if (pct > 95) return "#ef4444";
  if (pct >= 85) return "#f97316";
  if (pct >= 60) return "#eab308";
  return "#22c55e";
}

/**
 * Per-rack occupancy for map bars/tooltips — computed once (memo upstream).
 * Occupancy % = occupied location slots / all location slots (never product counts).
 * Volume is optional metadata for tooltips when capacity is known.
 */
export function buildRackOccupancyStats(params: {
  layout: LayoutState;
  index: ProductLocationIndex;
  productsById: Map<string, WarehouseProduct>;
  binVolumeDm3: (bin: { volume_dm3?: number; width_cm?: number; depth_cm?: number; height_cm?: number }, rack: RackState) => number;
}): Map<string, RackOccupancyStats> {
  const { layout, index, productsById, binVolumeDm3 } = params;
  const out = new Map<string, RackOccupancyStats>();

  for (const rack of layout.racks) {
    const rid = rackKey(rack);
    const bins = activeBinsForRack(rack);
    let locationCount = 0;
    let occupiedLocations = 0;
    let volumeCapacityDm3 = 0;
    const seenLoc = new Set<string>();

    for (const bin of bins) {
      volumeCapacityDm3 += binVolumeDm3(bin, rack);
      const u = normalizeInventoryLocationUuid(binLocationUuid(bin));
      if (u) {
        if (seenLoc.has(u)) continue;
        seenLoc.add(u);
        locationCount += 1;
        const entries = index.byLocation.get(u);
        if (entries && entries.some((e) => e.quantity > 0)) occupiedLocations += 1;
      } else {
        locationCount += 1;
      }
    }

    let volumeUsedDm3 = 0;
    for (const e of index.byRack.get(rid) ?? []) {
      const p = productsById.get(e.productId);
      if (!p) continue;
      volumeUsedDm3 += e.quantity * safeVolumeDm3(p.volume_dm3);
    }

    const occupancyPct = locationCount > 0 ? Math.min(100, (occupiedLocations / locationCount) * 100) : 0;
    const volumePct =
      volumeCapacityDm3 > 0 ? Math.min(100, (volumeUsedDm3 / volumeCapacityDm3) * 100) : null;

    out.set(rid, {
      rackId: rid,
      locationCount,
      occupiedLocations,
      freeLocations: Math.max(0, locationCount - occupiedLocations),
      occupancyPct,
      barColor: occupancyBarColor(occupancyPct),
      volumeUsedDm3,
      volumeCapacityDm3,
      volumePct,
    });
  }

  return out;
}
