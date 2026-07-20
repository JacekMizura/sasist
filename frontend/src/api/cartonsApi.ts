import api from "./axios";

export type CartonShippingMethodMini = {
  id: string;
  name: string;
  code: string;
  logo_url: string | null;
};

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

export type CartonDto = {
  id: string;
  tenant_id: number;
  warehouse_id: number;
  name: string;
  image_url?: string | null;
  sku?: string | null;
  ean?: string | null;
  material_type?: string | null;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  internal_length_cm?: number | null;
  internal_width_cm?: number | null;
  internal_height_cm?: number | null;
  max_payload_kg?: number | null;
  weight_kg: number;
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
  stock: number;
  reserved_qty?: number;
  available_qty?: number;
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
  plastic_kg_per_unit?: number;
  paper_kg_per_unit?: number;
  wood_kg_per_unit?: number;
  glass_kg_per_unit?: number;
  metal_kg_per_unit?: number;
  packaging_type?: string | null;
  include_in_bdo?: boolean;
  shipping_method_ids: string[];
  shipping_methods: CartonShippingMethodMini[];
  price_tiers?: PriceTierDto[];
};

export type PriceTierWrite = {
  qty_from: number;
  package_qty?: number | null;
  package_net_total?: number | null;
  package_gross_total?: number | null;
};

export async function getCartons(params: {
  tenant_id: number;
  warehouse_id: number;
  active_only?: boolean;
  shipping_method_id?: string | null;
  q?: string | null;
}): Promise<CartonDto[]> {
  const res = await api.get<CartonDto[]>("/cartons/", {
    params: {
      tenant_id: params.tenant_id,
      warehouse_id: params.warehouse_id,
      active_only: params.active_only ?? false,
      ...(params.shipping_method_id?.trim()
        ? { shipping_method_id: params.shipping_method_id.trim() }
        : {}),
      ...(params.q?.trim() ? { q: params.q.trim() } : {}),
    },
  });
  return Array.isArray(res.data) ? res.data : [];
}

export async function getCarton(
  id: string,
  params: { tenant_id: number; warehouse_id: number },
): Promise<CartonDto> {
  const res = await api.get<CartonDto>(`/cartons/${id}/`, {
    params: { tenant_id: params.tenant_id, warehouse_id: params.warehouse_id },
  });
  return res.data;
}

export type CartonWritePayload = {
  name: string;
  image_url?: string | null;
  sku?: string | null;
  ean?: string | null;
  material_type?: string | null;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  internal_length_cm?: number | null;
  internal_width_cm?: number | null;
  internal_height_cm?: number | null;
  max_payload_kg?: number | null;
  weight_kg: number;
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
  stock?: number;
  reserved_qty?: number;
  location_label?: string | null;
  purchase_price?: number | null;
  unit_cost?: number | null;
  vat_rate_pct?: number;
  package_qty?: number | null;
  package_net_total?: number | null;
  package_gross_total?: number | null;
  low_stock_threshold?: number | null;
  reorder_qty?: number | null;
  plastic_kg_per_unit?: number | null;
  paper_kg_per_unit?: number | null;
  wood_kg_per_unit?: number | null;
  glass_kg_per_unit?: number | null;
  metal_kg_per_unit?: number | null;
  packaging_type?: string | null;
  include_in_bdo?: boolean;
  shipping_method_ids?: string[];
  price_tiers?: PriceTierWrite[];
};

export async function createCarton(
  payload: CartonWritePayload & { tenant_id: number; warehouse_id: number },
): Promise<CartonDto> {
  const res = await api.post<CartonDto>("/cartons/", payload);
  return res.data;
}

export async function updateCarton(
  id: string,
  params: { tenant_id: number; warehouse_id: number },
  payload: Partial<CartonWritePayload>,
): Promise<CartonDto> {
  const res = await api.put<CartonDto>(`/cartons/${id}/`, payload, {
    params: { tenant_id: params.tenant_id, warehouse_id: params.warehouse_id },
  });
  return res.data;
}

export async function duplicateCarton(
  id: string,
  params: { tenant_id: number; warehouse_id: number },
): Promise<CartonDto> {
  const res = await api.post<CartonDto>(`/cartons/${id}/duplicate/`, {}, {
    params: { tenant_id: params.tenant_id, warehouse_id: params.warehouse_id },
  });
  return res.data;
}

export async function deleteCarton(
  id: string,
  params: { tenant_id: number; warehouse_id: number },
): Promise<void> {
  await api.delete(`/cartons/${id}/`, { params });
}

export async function bulkSetCartonSupplier(
  params: { tenant_id: number; warehouse_id: number },
  body: { ids: string[]; supplier_id: number | null },
): Promise<{ updated: number; requested: number }> {
  const res = await api.patch<{ updated: number; requested: number }>("/cartons/bulk-supplier/", body, {
    params: { tenant_id: params.tenant_id, warehouse_id: params.warehouse_id },
  });
  return res.data;
}
