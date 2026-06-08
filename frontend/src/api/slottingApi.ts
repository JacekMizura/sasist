import api from "./axios";

export type CapacityCalculation = {
  fits: boolean;
  max_units: number;
  max_cartons: number;
  remaining_units: number;
  remaining_volume_dm3: number;
  remaining_weight_kg: number;
  volume_utilization_percent: number;
  weight_utilization_percent: number;
  failure_reason?: string | null;
  limiting_factor?: string | null;
};

export type LocationCapacityDetail = {
  location_id: number;
  location_code: string;
  warehouse_id: number;
  total_volume_dm3: number;
  total_weight_kg: number;
  occupied_volume_dm3: number;
  occupied_weight_kg: number;
  capacity_utilization_percent: number;
  fit?: CapacityCalculation | null;
};

export type PutawaySuggestion = {
  location_id: number;
  location_code: string;
  score: number;
  max_fit_quantity: number;
  remaining_capacity_percent: number;
  same_sku_present: boolean;
  reason_tags: string[];
  capacity?: CapacityCalculation | null;
};

export async function getLocationCapacity(
  tenantId: number,
  locationId: number,
  opts?: { productId?: number; quantity?: number; packagingMode?: string },
): Promise<LocationCapacityDetail> {
  const res = await api.get<LocationCapacityDetail>(`/slotting/locations/${locationId}/capacity`, {
    params: {
      tenant_id: tenantId,
      product_id: opts?.productId,
      quantity: opts?.quantity ?? 0,
      packaging_mode: opts?.packagingMode ?? "UNIT",
    },
  });
  return res.data;
}

export async function suggestPutawayLocations(body: {
  tenant_id: number;
  warehouse_id: number;
  product_id: number;
  quantity: number;
  packaging_mode?: string;
  preferred_zone?: string;
  strategy?: string;
  limit?: number;
}): Promise<PutawaySuggestion[]> {
  const res = await api.post<PutawaySuggestion[]>("/slotting/suggest-putaway", body);
  return res.data;
}

export function capacityStateLabel(utilPercent: number): string {
  if (utilPercent <= 0) return "Pusta";
  if (utilPercent < 25) return "Niska";
  if (utilPercent < 60) return "Średnia";
  if (utilPercent < 95) return "Wysoka";
  if (utilPercent <= 100) return "Pełna";
  return "Przekroczenie";
}

export function capacityStateClass(utilPercent: number): string {
  if (utilPercent <= 0) return "bg-slate-100 text-slate-600";
  if (utilPercent < 25) return "bg-emerald-100 text-emerald-800";
  if (utilPercent < 60) return "bg-amber-100 text-amber-900";
  if (utilPercent < 95) return "bg-orange-100 text-orange-900";
  if (utilPercent <= 100) return "bg-red-100 text-red-900";
  return "bg-fuchsia-100 text-fuchsia-900";
}
