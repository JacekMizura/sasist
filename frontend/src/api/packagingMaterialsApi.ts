import api from "./axios";

/** Legacy + new master-data codes */
export type PackagingMaterialType =
  | "tape"
  | "foil"
  | "filler"
  | "stretch_foil"
  | "packing_tape"
  | "paper_filler"
  | "bubble_wrap"
  | "courier_envelope"
  | "label_roll"
  | "other";

export type PackagingMaterialUnit = "roll" | "kg" | "pcs";

export type PriceTierDto = {
  id: string;
  sort_index: number;
  qty_from: number;
  package_qty?: number | null;
  package_net_total?: number | null;
  package_gross_total?: number | null;
  unit_net?: number | null;
  unit_gross?: number | null;
  discount_pct?: number | null;
};

export type PriceTierWrite = {
  qty_from: number;
  package_qty?: number | null;
  package_net_total?: number | null;
  package_gross_total?: number | null;
};

export type PackagingMaterialDto = {
  id: string;
  tenant_id: number;
  warehouse_id: number;
  name: string;
  material_type: string;
  unit: string;
  image_url?: string | null;
  sku?: string | null;
  stock: number;
  reserved_qty?: number;
  available_qty?: number;
  is_active: boolean;
  supplier_id?: number | null;
  supplier_name?: string | null;
  producer_id?: number | null;
  producer_name?: string | null;
  supplier_name_override?: string | null;
  lead_time_days?: number | null;
  moq?: number | null;
  purchase_pack_qty?: number | null;
  free_shipping_threshold_net?: number | null;
  last_purchase_price_net?: number | null;
  supplier_sku?: string | null;
  location_label?: string | null;
  purchase_price?: number | null;
  unit_cost?: number | null;
  vat_rate_pct?: number;
  package_qty?: number | null;
  package_net_total?: number | null;
  package_gross_total?: number | null;
  unit_net_price?: number | null;
  unit_gross_price?: number | null;
  low_stock_threshold?: number | null;
  reorder_qty?: number | null;
  notes?: string | null;
  width_mm?: number | null;
  length_m?: number | null;
  thickness_micron?: number | null;
  color?: string | null;
  net_weight_foil_kg?: number | null;
  tube_weight_kg?: number | null;
  stretch_percent?: number | null;
  tube_diameter_mm?: number | null;
  adhesive_type?: string | null;
  tape_weight_kg?: number | null;
  core_paper_weight_kg?: number | null;
  roll_diameter_mm?: number | null;
  grammage_gsm?: number | null;
  paper_type?: string | null;
  roll_weight_kg?: number | null;
  bubble_width_cm?: number | null;
  bubble_diameter_mm?: number | null;
  tolerance_percent?: number | null;
  bubble_weight_kg?: number | null;
  plastic_kg_per_unit?: number;
  paper_kg_per_unit?: number;
  wood_kg_per_unit?: number;
  glass_kg_per_unit?: number;
  metal_kg_per_unit?: number;
  packaging_type?: string | null;
  include_in_bdo?: boolean;
  price_tiers?: PriceTierDto[];
};

export async function getPackagingMaterials(params: {
  tenant_id: number;
  warehouse_id: number;
  material_type?: string | "" | null;
  active_only?: boolean;
  q?: string | null;
}): Promise<PackagingMaterialDto[]> {
  const res = await api.get<PackagingMaterialDto[]>("/packaging-materials/", {
    params: {
      tenant_id: params.tenant_id,
      warehouse_id: params.warehouse_id,
      active_only: params.active_only ?? false,
      ...(params.material_type ? { material_type: params.material_type } : {}),
      ...(params.q?.trim() ? { q: params.q.trim() } : {}),
    },
  });
  return Array.isArray(res.data) ? res.data : [];
}

export async function getPackagingMaterial(
  id: string,
  params: { tenant_id: number; warehouse_id: number },
): Promise<PackagingMaterialDto> {
  const res = await api.get<PackagingMaterialDto>(`/packaging-materials/${id}/`, {
    params: { tenant_id: params.tenant_id, warehouse_id: params.warehouse_id },
  });
  return res.data;
}

export type PackagingMaterialWritePayload = {
  name: string;
  material_type: string;
  unit: string;
  image_url?: string | null;
  sku?: string | null;
  stock?: number;
  reserved_qty?: number;
  is_active?: boolean;
  supplier_id?: number | null;
  producer_id?: number | null;
  supplier_name_override?: string | null;
  lead_time_days?: number | null;
  moq?: number | null;
  purchase_pack_qty?: number | null;
  free_shipping_threshold_net?: number | null;
  last_purchase_price_net?: number | null;
  supplier_sku?: string | null;
  location_label?: string | null;
  purchase_price?: number | null;
  unit_cost?: number | null;
  vat_rate_pct?: number;
  package_qty?: number | null;
  package_net_total?: number | null;
  package_gross_total?: number | null;
  low_stock_threshold?: number | null;
  reorder_qty?: number | null;
  notes?: string | null;
  width_mm?: number | null;
  length_m?: number | null;
  thickness_micron?: number | null;
  color?: string | null;
  net_weight_foil_kg?: number | null;
  tube_weight_kg?: number | null;
  stretch_percent?: number | null;
  tube_diameter_mm?: number | null;
  adhesive_type?: string | null;
  tape_weight_kg?: number | null;
  core_paper_weight_kg?: number | null;
  roll_diameter_mm?: number | null;
  grammage_gsm?: number | null;
  paper_type?: string | null;
  roll_weight_kg?: number | null;
  bubble_width_cm?: number | null;
  bubble_diameter_mm?: number | null;
  tolerance_percent?: number | null;
  bubble_weight_kg?: number | null;
  plastic_kg_per_unit?: number;
  paper_kg_per_unit?: number;
  wood_kg_per_unit?: number;
  glass_kg_per_unit?: number;
  metal_kg_per_unit?: number;
  packaging_type?: string | null;
  include_in_bdo?: boolean;
  price_tiers?: PriceTierWrite[];
};

export async function createPackagingMaterial(
  payload: PackagingMaterialWritePayload & { tenant_id: number; warehouse_id: number },
): Promise<PackagingMaterialDto> {
  const res = await api.post<PackagingMaterialDto>("/packaging-materials/", payload);
  return res.data;
}

export async function updatePackagingMaterial(
  id: string,
  params: { tenant_id: number; warehouse_id: number },
  payload: Partial<PackagingMaterialWritePayload>,
): Promise<PackagingMaterialDto> {
  const res = await api.put<PackagingMaterialDto>(`/packaging-materials/${id}/`, payload, {
    params: { tenant_id: params.tenant_id, warehouse_id: params.warehouse_id },
  });
  return res.data;
}

export async function duplicatePackagingMaterial(
  id: string,
  params: { tenant_id: number; warehouse_id: number },
): Promise<PackagingMaterialDto> {
  const res = await api.post<PackagingMaterialDto>(`/packaging-materials/${id}/duplicate/`, {}, {
    params: { tenant_id: params.tenant_id, warehouse_id: params.warehouse_id },
  });
  return res.data;
}

export async function patchPackagingMaterialStock(
  id: string,
  params: { tenant_id: number; warehouse_id: number },
  stock: number,
): Promise<PackagingMaterialDto> {
  const res = await api.patch<PackagingMaterialDto>(`/packaging-materials/${id}/stock/`, { stock }, {
    params: { tenant_id: params.tenant_id, warehouse_id: params.warehouse_id },
  });
  return res.data;
}

export async function deletePackagingMaterial(
  id: string,
  params: { tenant_id: number; warehouse_id: number },
): Promise<void> {
  await api.delete(`/packaging-materials/${id}/`, { params });
}

export async function bulkSetPackagingMaterialSupplier(
  params: { tenant_id: number; warehouse_id: number },
  body: { ids: string[]; supplier_id: number | null },
): Promise<{ updated: number; requested: number }> {
  const res = await api.patch<{ updated: number; requested: number }>("/packaging-materials/bulk-supplier/", body, {
    params: { tenant_id: params.tenant_id, warehouse_id: params.warehouse_id },
  });
  return res.data;
}
