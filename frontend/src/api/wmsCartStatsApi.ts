/** WMS cart occupancy SSOT — GET /wms/carts/{id}/stats */

import api from "./axios";
import type { CapacitySnapshot } from "../types/cartCapacity";

export type WmsCartStats = {
  orders_count: number;
  products_count: number;
  sections_count: number;
  occupied_sections: number;
  volume_used: number;
  percent_used: number;
  /** Capacity Engine snapshot — independent of Cart.status lifecycle. */
  capacity?: CapacitySnapshot;
  /** Canonical cart lifecycle status from picking lifecycle SSOT. */
  status?: string;
};

export const EMPTY_WMS_CART_STATS: WmsCartStats = {
  orders_count: 0,
  products_count: 0,
  sections_count: 0,
  occupied_sections: 0,
  volume_used: 0,
  percent_used: 0,
};

function parseBasketSummary(raw: unknown): CapacitySnapshot["basket_summary"] {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const slotsRaw = Array.isArray(b.slots) ? b.slots : [];
  return {
    total: Number(b.total) || 0,
    occupied: Number(b.occupied) || 0,
    free: Number(b.free) || 0,
    slots: slotsRaw.map((s) => {
      const slot = s as Record<string, unknown>;
      return {
        id: Number(slot.id) || 0,
        occupied: Boolean(slot.occupied),
        order_id: slot.order_id != null ? Number(slot.order_id) : null,
        usable_volume: Number(slot.usable_volume) || 0,
        used_volume: Number(slot.used_volume) || 0,
        remaining_volume: Number(slot.remaining_volume) || 0,
      };
    }),
  };
}

export function parseCapacitySnapshot(raw: unknown): CapacitySnapshot | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  return {
    strategy: String(d.strategy ?? ""),
    occupancy_state: String(d.occupancy_state ?? ""),
    capacity_orders: d.capacity_orders != null ? Number(d.capacity_orders) : null,
    capacity_volume: d.capacity_volume != null ? Number(d.capacity_volume) : null,
    assigned_orders: Number(d.assigned_orders) || 0,
    assigned_volume: Number(d.assigned_volume) || 0,
    remaining_orders: d.remaining_orders != null ? Number(d.remaining_orders) : null,
    remaining_volume: d.remaining_volume != null ? Number(d.remaining_volume) : null,
    capacity_usage_percent: Number(d.capacity_usage_percent) || 0,
    is_capacity_reached: Boolean(d.is_capacity_reached),
    basket_summary: parseBasketSummary(d.basket_summary),
  };
}

export async function fetchWmsCartStats(cartId: number): Promise<WmsCartStats> {
  const res = await api.get<Record<string, unknown>>(`/wms/carts/${cartId}/stats`);
  const d = res.data;
  return {
    orders_count: Number(d.orders_count) || 0,
    products_count: Number(d.products_count) || 0,
    sections_count: Number(d.sections_count) || 0,
    occupied_sections: Number(d.occupied_sections) || 0,
    volume_used: Number(d.volume_used) || 0,
    percent_used: Number(d.percent_used) || 0,
    capacity: parseCapacitySnapshot(d.capacity),
    status: d.status != null ? String(d.status) : undefined,
  };
}
