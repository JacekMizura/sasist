import type { LayoutState } from "../../types/warehouse";

export type InventoryRow = {
  id: number;
  tenant_id: number;
  product_id: number;
  warehouse_id: number;
  location_id: number;
  quantity: number;
  reserved_quantity?: number;
  available_quantity?: number;
  tenant_name?: string | null;
  product_name?: string | null;
  warehouse_name?: string | null;
  location_name?: string | null;
  location_uuid?: string | null;
};

export type InventoryMaps = {
  byProduct: Map<string, InventoryRow[]>;
  /** Rows grouped by Location.location_uuid (join key with bin.locationUUID / assigned_locations). */
  byLocationUuid: Map<string, InventoryRow[]>;
  byRackId: Map<string, InventoryRow[]>;
};

/** Trimmed location UUID for map keys (join with bin.locationUUID / assigned_locations). */
export function normalizeInventoryLocationUuid(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function rackKey(r: { id?: number; rack_index: number }): string {
  return String(r.id ?? r.rack_index);
}

export function buildInventoryMaps(inventoryRows: InventoryRow[], layout: LayoutState): InventoryMaps {
  const byProduct = new Map<string, InventoryRow[]>();
  const byLocationUuid = new Map<string, InventoryRow[]>();
  const byRackId = new Map<string, InventoryRow[]>();

  const locationUuidToRackKey = new Map<string, string>();
  for (const r of layout.racks) {
    const rk = rackKey(r);
    for (const b of r.bins ?? []) {
      const bu = normalizeInventoryLocationUuid(
        (b as { location_uuid?: string; locationUUID?: string }).location_uuid ?? (b as { locationUUID?: string }).locationUUID
      );
      if (bu) locationUuidToRackKey.set(bu, rk);
    }
  }

  for (const row of inventoryRows) {
    const uuidKey = normalizeInventoryLocationUuid(row.location_uuid);
    const productIdKey = String(row.product_id);
    const rackIdKey = uuidKey ? locationUuidToRackKey.get(uuidKey) : undefined;

    {
      const arr = byProduct.get(productIdKey);
      if (arr) arr.push(row);
      else byProduct.set(productIdKey, [row]);
    }

    if (uuidKey) {
      const arr = byLocationUuid.get(uuidKey);
      if (arr) arr.push(row);
      else byLocationUuid.set(uuidKey, [row]);
    }

    if (rackIdKey) {
      const arr = byRackId.get(rackIdKey);
      if (arr) arr.push(row);
      else byRackId.set(rackIdKey, [row]);
    }
  }

  return { byProduct, byLocationUuid, byRackId };
}
