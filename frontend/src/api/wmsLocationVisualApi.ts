import api from "./axios";
import type { InventoryDamageTrace } from "../types/inventoryDamageTrace";

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
  aisle_letter?: string;
  is_same_aisle?: boolean;
};

export type LocationVisualBin = {
  code: string;
  location_id?: number | null;
  level_index: number;
  level_number: number;
  segment_index: number;
  segment_label: string;
  is_active: boolean;
  storage_type?: string | null;
  location_kind?: string | null;
  is_empty?: boolean;
  is_blocked?: boolean;
  sku?: string | null;
  quantity?: number;
  carrier_code?: string | null;
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
  ean?: string | null;
  name?: string | null;
  image_url?: string | null;
  quantity: number;
  stock_disposition?: string | null;
  disposition_badge?: string | null;
  damage_class?: string | null;
  damage_trace?: InventoryDamageTrace | null;
  row_key?: string | null;
};

export type LocationVisualCapacityBasis = "volume" | "weight" | "slots" | "none";

export type LocationVisualOccupancy = {
  sku_count: number;
  total_qty: number;
  occupied_volume_dm3: number;
  used_volume_dm3?: number;
  max_volume_dm3?: number | null;
  used_weight_kg?: number;
  max_weight_kg?: number | null;
  used_slots?: number | null;
  total_slots?: number | null;
  capacity_basis?: LocationVisualCapacityBasis;
  capacity_utilization_percent?: number | null;
  capacity_label?: string | null;
  storage_type?: string | null;
  location_type: string;
};

export type LocationVisualLastMovement = {
  type_label: string;
  document_label?: string | null;
  occurred_at?: string | null;
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
  last_movement?: LocationVisualLastMovement | null;
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
