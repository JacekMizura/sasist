import api from "../../api/axios";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import type { DamageCandidate } from "../../types/damageReport";
import type { WarehouseProduct } from "../../types/warehouse";

export { DAMAGE_TENANT_ID };

export type WarehouseOption = { id: number; name: string };

type InventoryRow = {
  product_id: number;
  warehouse_id: number;
  location_uuid?: string | null;
  quantity: number;
  available_quantity?: number;
};

type LayoutBin = {
  label: string;
  storage_type?: string;
  location_uuid?: string;
  locationUUID?: string;
};

type LayoutRack = { bins?: LayoutBin[] };
type LayoutResponse = { layout?: { racks?: LayoutRack[] } } | { racks?: LayoutRack[] };

function norm(v: unknown): string {
  const s = String(v ?? "").trim();
  return s && s.toLowerCase() !== "null" ? s : "";
}

function isDamagedType(v: unknown): boolean {
  return norm(v).toLowerCase() === "damaged";
}

export async function fetchWarehouses(): Promise<WarehouseOption[]> {
  const res = await api.get<WarehouseOption[]>("/warehouses/");
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchDamageCandidates(warehouseId: number): Promise<DamageCandidate[]> {
  const [layoutRes, productsRes, inventoryRes] = await Promise.all([
    api.get<LayoutResponse>("/warehouse/layout", {
      params: { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId },
    }),
    api.get<{ items?: WarehouseProduct[] } | WarehouseProduct[]>("/products/", {
      params: { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId },
    }),
    api.get<InventoryRow[]>("/inventory/", {
      params: { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId, hide_technical_locations: false },
    }),
  ]);

  const layoutData = (layoutRes.data as { layout?: { racks?: LayoutRack[] } })?.layout ?? (layoutRes.data as { racks?: LayoutRack[] });
  const racks = Array.isArray(layoutData?.racks) ? layoutData.racks : [];
  const damagedByUuid = new Map<string, string>();
  for (const rack of racks) {
    for (const bin of Array.isArray(rack.bins) ? rack.bins : []) {
      if (!isDamagedType(bin.storage_type)) continue;
      const u = norm(bin.location_uuid ?? bin.locationUUID);
      if (!u) continue;
      damagedByUuid.set(u, String(bin.label ?? u));
    }
  }

  const rawProducts = Array.isArray(productsRes.data)
    ? productsRes.data
    : Array.isArray((productsRes.data as { items?: WarehouseProduct[] })?.items)
      ? ((productsRes.data as { items?: WarehouseProduct[] }).items as WarehouseProduct[])
      : [];
  const productById = new Map<number, WarehouseProduct>();
  for (const p of rawProducts) {
    const id = Number(p.id);
    if (Number.isFinite(id)) productById.set(id, p);
  }

  const out = new Map<string, DamageCandidate>();
  for (const inv of Array.isArray(inventoryRes.data) ? inventoryRes.data : []) {
    if (Number(inv.warehouse_id) !== warehouseId) continue;
    const uuid = norm(inv.location_uuid);
    if (!uuid || !damagedByUuid.has(uuid)) continue;
    const pid = Number(inv.product_id);
    const p = productById.get(pid);
    if (!p) continue;
    const qty = Number(inv.available_quantity ?? inv.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const key = `${pid}|${uuid}`;
    const prev = out.get(key);
    if (prev) {
      prev.availableQuantity += qty;
      continue;
    }
    const img = p.image_url != null && String(p.image_url).trim() !== "" ? String(p.image_url).trim() : undefined;
    out.set(key, {
      productId: pid,
      productName: p.name ?? "Nieznany produkt",
      sku: p.sku ?? undefined,
      imageUrl: img,
      locationUUID: uuid,
      locationLabel: damagedByUuid.get(uuid) ?? uuid,
      availableQuantity: qty,
      purchasePrice: Number(p.purchase_price ?? 0),
    });
  }
  return [...out.values()].sort((a, b) => b.availableQuantity - a.availableQuantity);
}

/**
 * First damaged-layout bin UUID (for posting a damage entry after WMS decision).
 * Return lines are not tied to locations; placement happens when recording damage.
 */
export async function fetchFirstDamagedBinUuid(warehouseId: number): Promise<string | null> {
  const layoutRes = await api.get<LayoutResponse>("/warehouse/layout", {
    params: { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId },
  });
  const layoutData =
    (layoutRes.data as { layout?: { racks?: LayoutRack[] } })?.layout ?? (layoutRes.data as { racks?: LayoutRack[] });
  const racks = Array.isArray(layoutData?.racks) ? layoutData.racks : [];
  for (const rack of racks) {
    for (const bin of Array.isArray(rack.bins) ? rack.bins : []) {
      if (!isDamagedType(bin.storage_type)) continue;
      const u = norm(bin.location_uuid ?? bin.locationUUID);
      if (u) return u;
    }
  }
  return null;
}

