/** WMS cart occupancy SSOT — GET /wms/carts/{id}/stats */

import api from "./axios";

export type WmsCartStats = {
  orders_count: number;
  products_count: number;
  sections_count: number;
  occupied_sections: number;
  volume_used: number;
  percent_used: number;
};

export const EMPTY_WMS_CART_STATS: WmsCartStats = {
  orders_count: 0,
  products_count: 0,
  sections_count: 0,
  occupied_sections: 0,
  volume_used: 0,
  percent_used: 0,
};

export async function fetchWmsCartStats(cartId: number): Promise<WmsCartStats> {
  const res = await api.get<WmsCartStats>(`/wms/carts/${cartId}/stats`);
  const d = res.data;
  return {
    orders_count: Number(d.orders_count) || 0,
    products_count: Number(d.products_count) || 0,
    sections_count: Number(d.sections_count) || 0,
    occupied_sections: Number(d.occupied_sections) || 0,
    volume_used: Number(d.volume_used) || 0,
    percent_used: Number(d.percent_used) || 0,
  };
}
