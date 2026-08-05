import api from "./axios";

export type VariantDisplayType = "text" | "color" | "image";

export type VariantValue = {
  id?: number;
  name: string;
  sort_order?: number;
  color_hex?: string | null;
  image_url?: string | null;
};

export type VariantAxis = {
  id?: number;
  name: string;
  sort_order?: number;
  display_type?: VariantDisplayType;
  show_in_filters?: boolean;
  sort_alpha?: boolean;
  values: VariantValue[];
};

export type VariantGroupListItem = {
  id: number;
  tenant_id: number;
  name: string;
  is_active: boolean;
  axis_count: number;
  value_count: number;
  product_count: number;
  combination_count: number;
};

export type VariantGroup = {
  id: number;
  tenant_id: number;
  name: string;
  is_active: boolean;
  axes: Required<Pick<VariantAxis, "id" | "name" | "sort_order" | "display_type" | "show_in_filters" | "sort_alpha" | "values">>[];
  axis_count: number;
  value_count: number;
  product_count: number;
};

export type VariantGroupWrite = {
  name: string;
  is_active: boolean;
  axes: VariantAxis[];
};

export type ProductVariantValueRead = {
  axis_id: number;
  axis_name: string;
  value_id: number;
  value_name: string;
};

export type ProductVariantSku = {
  id: number;
  name: string;
  sku?: string | null;
  ean?: string | null;
  sale_price?: number | null;
  image_url?: string | null;
  stock_quantity: number;
  values: ProductVariantValueRead[];
  value_key: string;
};

export type ProductVariantsState = {
  product_id: number;
  is_variant_child: boolean;
  parent_product_id?: number | null;
  parent_product_name?: string | null;
  variant_group_id?: number | null;
  group?: VariantGroup | null;
  skus: ProductVariantSku[];
  possible_combinations: number;
  missing_combinations: number;
};

export async function listVariantGroups(
  tenantId: number,
  opts?: { includeInactive?: boolean },
): Promise<VariantGroupListItem[]> {
  const res = await api.get<VariantGroupListItem[]>("/variant-groups", {
    params: { tenant_id: tenantId, include_inactive: opts?.includeInactive ?? true },
  });
  return res.data;
}

export async function getVariantGroup(tenantId: number, groupId: number): Promise<VariantGroup> {
  const res = await api.get<VariantGroup>(`/variant-groups/${groupId}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function createVariantGroup(tenantId: number, body: VariantGroupWrite): Promise<VariantGroup> {
  const res = await api.post<VariantGroup>("/variant-groups", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function updateVariantGroup(
  tenantId: number,
  groupId: number,
  body: VariantGroupWrite,
): Promise<VariantGroup> {
  const res = await api.put<VariantGroup>(`/variant-groups/${groupId}`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function deleteVariantGroup(tenantId: number, groupId: number): Promise<void> {
  await api.delete(`/variant-groups/${groupId}`, { params: { tenant_id: tenantId } });
}

export async function getProductVariants(tenantId: number, productId: number): Promise<ProductVariantsState> {
  const res = await api.get<ProductVariantsState>(`/products/${productId}/variants`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function attachProductVariantGroup(
  tenantId: number,
  productId: number,
  variantGroupId: number | null,
): Promise<ProductVariantsState> {
  const res = await api.put<ProductVariantsState>(
    `/products/${productId}/variants/group`,
    { variant_group_id: variantGroupId },
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function generateProductVariants(
  tenantId: number,
  productId: number,
  onlyMissing = true,
): Promise<{ created_count: number; skus: ProductVariantSku[] }> {
  const res = await api.post<{ created_count: number; skus: ProductVariantSku[] }>(
    `/products/${productId}/variants/generate`,
    { only_missing: onlyMissing },
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function patchProductVariantSku(
  tenantId: number,
  productId: number,
  childId: number,
  body: { name?: string; sku?: string | null; ean?: string | null; sale_price?: number | null },
): Promise<ProductVariantSku> {
  const res = await api.patch<ProductVariantSku>(
    `/products/${productId}/variants/skus/${childId}`,
    body,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function deleteProductVariantSku(
  tenantId: number,
  productId: number,
  childId: number,
): Promise<void> {
  await api.delete(`/products/${productId}/variants/skus/${childId}`, {
    params: { tenant_id: tenantId },
  });
}
