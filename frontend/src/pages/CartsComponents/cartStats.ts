/**
 * Cart occupancy display helpers.
 * Liczniki zajętości: wyłącznie z GET /wms/carts/{id}/stats (WmsCartStats).
 * Nie wyliczaj lokalnie z assigned_orders / baskets.
 */

import type { WmsCartStats } from "../../api/wmsCartStatsApi";
import { EMPTY_WMS_CART_STATS } from "../../api/wmsCartStatsApi";

export type CartStats = {
  total_orders: number;
  total_products: number;
  baskets_used: number;
  sections_count: number;
  used_volume_dm3: number;
  percent_used: number;
  used_weight: number;
};

/** Map backend SSOT stats → legacy CartStats shape used by fleet UI. */
export function cartStatsFromWms(stats: WmsCartStats | null | undefined): CartStats {
  const s = stats ?? EMPTY_WMS_CART_STATS;
  return {
    total_orders: s.orders_count,
    total_products: s.products_count,
    baskets_used: s.occupied_sections,
    sections_count: s.sections_count,
    used_volume_dm3: s.volume_used,
    percent_used: s.percent_used,
    used_weight: 0,
  };
}

/** @deprecated Prefer cartStatsFromWms(fetchWmsCartStats(...)). Kept for gradual migration. */
export function calculateCartStats(
  cart:
    | {
        total_orders?: number;
        total_products?: number;
        baskets_used?: number;
        sections_count?: number;
        occupied_sections?: number;
        used_volume?: number;
        used_volume_dm3?: number;
        percent_used?: number;
        total_weight_kg?: number;
      }
    | null
    | undefined
): CartStats {
  if (!cart) {
    return {
      total_orders: 0,
      total_products: 0,
      baskets_used: 0,
      sections_count: 0,
      used_volume_dm3: 0,
      percent_used: 0,
      used_weight: 0,
    };
  }
  return {
    total_orders: Number(cart.total_orders) || 0,
    total_products: Number(cart.total_products) || 0,
    baskets_used: Number(cart.occupied_sections ?? cart.baskets_used) || 0,
    sections_count: Number(cart.sections_count) || 0,
    used_volume_dm3:
      typeof cart.used_volume_dm3 === "number"
        ? cart.used_volume_dm3
        : Number(cart.used_volume) || 0,
    percent_used: Number(cart.percent_used) || 0,
    used_weight: Number(cart.total_weight_kg) || 0,
  };
}
