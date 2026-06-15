import type { WarehouseContextResponse } from "../api/authApi";

export type WarehouseBrief = {
  id: number;
  name: string;
  requires_putaway?: boolean;
};

export function pickActiveWarehouse(
  list: WarehouseBrief[],
  activeId: number | null | undefined,
): WarehouseBrief | null {
  if (activeId != null) {
    const hit = list.find((w) => w.id === activeId);
    if (hit) return hit;
  }
  return list[0] ?? null;
}

export function applyWarehouseContext(ctx: WarehouseContextResponse): {
  list: WarehouseBrief[];
  active: WarehouseBrief | null;
  showSelector: boolean;
  activeRequiresPutaway: boolean;
} {
  const list = (ctx.warehouses ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    requires_putaway: w.requires_putaway !== false,
  }));
  const active = pickActiveWarehouse(list, ctx.active_warehouse_id);
  const activeRequiresPutaway =
    ctx.active_warehouse_requires_putaway !== undefined
      ? Boolean(ctx.active_warehouse_requires_putaway)
      : active?.requires_putaway !== false;
  return {
    list,
    active,
    showSelector: Boolean(ctx.show_warehouse_selector),
    activeRequiresPutaway,
  };
}

/** WMS gate — user has no operable warehouses from `/auth/me/warehouse-context`. */
export function hasOperableWarehouses(warehouses: WarehouseBrief[]): boolean {
  return warehouses.length > 0;
}
