import api from "./axios";

export type LocationVisualWarehouse = { id: number; name: string };

export type LocationVisualZone = {
  code: string;
  aisle: string;
  level: string;
  position: string;
};

export type LocationVisualRack = {
  id: number;
  name: string;
  aisle_letter: string;
  rack_index: number;
  levels: number;
  bins_per_level: number;
  color?: string | null;
};

export type LocationVisualRackGridCell = {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string | null;
  zone_code: string;
  is_active: boolean;
};

export type LocationVisualBin = {
  code: string;
  location_id?: number | null;
  level_index: number;
  level_number: number;
  segment_index: number;
  segment_label: string;
  is_active: boolean;
};

export type LocationVisualCarrier = {
  id: number;
  code: string;
  barcode: string;
  name?: string | null;
  status: string;
  sku_count: number;
  total_qty: number;
};

export type LocationVisualProduct = {
  product_id: number;
  sku?: string | null;
  name?: string | null;
  image_url?: string | null;
  quantity: number;
};

export type LocationVisualOccupancy = {
  sku_count: number;
  total_qty: number;
  occupied_volume_dm3: number;
  capacity_utilization_percent: number;
  storage_type?: string | null;
  location_type: string;
};

export type LocationVisualContext = {
  warehouse: LocationVisualWarehouse;
  location: { id: number; code: string; name: string; location_uuid?: string | null; rack_name?: string | null };
  zone: LocationVisualZone;
  rack?: LocationVisualRack | null;
  rack_grid: LocationVisualRackGridCell[];
  rack_bins: LocationVisualBin[];
  carrier?: LocationVisualCarrier | null;
  products: LocationVisualProduct[];
  occupancy: LocationVisualOccupancy;
  last_movement_at?: string | null;
};

export async function getLocationVisualContext(
  tenantId: number,
  locationId: number,
  carrierId?: number | null,
): Promise<LocationVisualContext> {
  const params: Record<string, number> = { tenant_id: tenantId };
  if (carrierId != null && carrierId > 0) params.carrier_id = carrierId;
  const res = await api.get<LocationVisualContext>(`/wms/locations/${locationId}/visual-context`, { params });
  return res.data;
}
