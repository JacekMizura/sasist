import api from "../../api/axios";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import type { DamageCandidate } from "../../types/damageReport";
import type { LayoutState, WarehouseProduct } from "../../types/warehouse";
import { rawLayoutRackToRackState, type RawLayoutRack } from "../../components/warehouse/warehouseUtils";
import { resolveWarehouseLocation, syncLayoutDisplayFields } from "../../utils/resolvedWarehouseLocation";

export { DAMAGE_TENANT_ID };

export type WarehouseOption = { id: number; name: string };

type InventoryRow = {
  product_id: number;
  warehouse_id: number;
  location_uuid?: string | null;
  quantity: number;
  available_quantity?: number;
};

type LayoutResponse = { layout?: { racks?: RawLayoutRack[] } } | { racks?: RawLayoutRack[] };

function norm(v: unknown): string {
  const s = String(v ?? "").trim();
  return s && s.toLowerCase() !== "null" ? s : "";
}

function isDamagedType(v: unknown): boolean {
  return norm(v).toLowerCase() === "damaged";
}

function layoutFromApiPayload(data: LayoutResponse | undefined, warehouseId: number): LayoutState {
  const layoutData = (data as { layout?: { racks?: RawLayoutRack[] } })?.layout ?? (data as { racks?: RawLayoutRack[] });
  const rawRacks = Array.isArray(layoutData?.racks) ? layoutData.racks : [];
  const base: LayoutState = {
    layout_id: null,
    warehouse_id: warehouseId,
    grid_cols: 24,
    grid_rows: 16,
    racks: rawRacks.map((r) => rawLayoutRackToRackState(r)),
    aisles: [],
  };
  return syncLayoutDisplayFields(base);
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

  const layout = layoutFromApiPayload(layoutRes.data, warehouseId);
  const damagedByUuid = new Map<string, string>();
  for (const rack of layout.racks) {
    for (const bin of rack.bins ?? []) {
      if (!isDamagedType(bin.storage_type)) continue;
      const u = norm(bin.locationUUID);
      if (!u) continue;
      damagedByUuid.set(u, resolveWarehouseLocation(rack, bin, layout).label || u);
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
  const layout = layoutFromApiPayload(layoutRes.data, warehouseId);
  for (const rack of layout.racks) {
    for (const bin of rack.bins ?? []) {
      if (!isDamagedType(bin.storage_type)) continue;
      const u = norm(bin.locationUUID);
      if (u) return u;
    }
  }
  return null;
}
