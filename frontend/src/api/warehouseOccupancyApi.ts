import api from "./axios";

export type WarehouseOccupancyMetrics = {
  total_volume_dm3: number;
  primary_volume_dm3: number;
  reserve_volume_dm3: number;
  damaged_volume_dm3: number;
  /** Suma pojemności slotów (dm³) z aktywnego layoutu — spójny mianownik z użytym wolumenem. */
  layout_capacity_volume_dm3?: number;
  /** Liczba slotów (UUID binów) w layoucie wg typu — nie wiersze ``locations``. */
  primary_location_count: number;
  reserve_location_count: number;
  damaged_location_count: number;
  primary_slots_with_stock?: number;
  reserve_slots_with_stock?: number;
  damaged_slots_with_stock?: number;
};

export async function fetchWarehouseOccupancyMetrics(
  tenantId: number,
  warehouseId: number
): Promise<WarehouseOccupancyMetrics> {
  const { data } = await api.get<WarehouseOccupancyMetrics>("/warehouse/occupancy-metrics", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return data;
}
