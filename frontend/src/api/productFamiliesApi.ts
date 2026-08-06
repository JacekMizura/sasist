import api from "./axios";

export type FamilyDisplayType = "text" | "color" | "image";

export type FamilyAttributeValue = {
  id?: number;
  name: string;
  sort_order?: number;
  color_hex?: string | null;
  image_url?: string | null;
};

export type FamilyAttribute = {
  id?: number;
  name: string;
  sort_order?: number;
  display_type?: FamilyDisplayType;
  show_in_filters?: boolean;
  sort_alpha?: boolean;
  values: FamilyAttributeValue[];
};

export type ProductFamilyListItem = {
  id: number;
  tenant_id: number;
  name: string;
  is_active: boolean;
  base_product_id?: number | null;
  attribute_count: number;
  value_count: number;
  product_count: number;
  combination_count: number;
};

export type ProductFamilyMember = {
  id: number;
  name: string;
  sku?: string | null;
  catalog_number?: string | null;
  ean?: string | null;
  image_url?: string | null;
  is_base: boolean;
  attribute_summary: string;
  sale_price?: number | null;
  stock_quantity?: number | null;
  is_active?: boolean;
};

export type ProductFamily = {
  id: number;
  tenant_id: number;
  name: string;
  is_active: boolean;
  base_product_id?: number | null;
  base_product_name?: string | null;
  attributes: Required<
    Pick<FamilyAttribute, "id" | "name" | "sort_order" | "display_type" | "show_in_filters" | "sort_alpha" | "values">
  >[];
  attribute_count: number;
  value_count: number;
  product_count: number;
  combination_count: number;
  members?: ProductFamilyMember[];
};

export type ProductFamilyWrite = {
  name: string;
  is_active: boolean;
  base_product_id?: number | null;
  attributes: FamilyAttribute[];
};

export type ProductFamilyProductState = {
  product_id: number;
  product_family_id?: number | null;
  family?: ProductFamily | null;
  family_product_count: number;
};

export async function listProductFamilies(
  tenantId: number,
  opts?: { includeInactive?: boolean },
): Promise<ProductFamilyListItem[]> {
  const res = await api.get<ProductFamilyListItem[]>("/product-families", {
    params: { tenant_id: tenantId, include_inactive: opts?.includeInactive ?? true },
  });
  return res.data;
}

export async function getProductFamily(
  tenantId: number,
  familyId: number,
  opts?: { includeMembers?: boolean },
): Promise<ProductFamily> {
  const res = await api.get<ProductFamily>(`/product-families/${familyId}`, {
    params: {
      tenant_id: tenantId,
      include_members: opts?.includeMembers ?? true,
    },
  });
  return res.data;
}

export async function createProductFamily(tenantId: number, body: ProductFamilyWrite): Promise<ProductFamily> {
  const res = await api.post<ProductFamily>("/product-families", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function updateProductFamily(
  tenantId: number,
  familyId: number,
  body: ProductFamilyWrite,
): Promise<ProductFamily> {
  const res = await api.put<ProductFamily>(`/product-families/${familyId}`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function deleteProductFamily(tenantId: number, familyId: number): Promise<void> {
  await api.delete(`/product-families/${familyId}`, { params: { tenant_id: tenantId } });
}

export async function getProductFamilyState(
  tenantId: number,
  productId: number,
): Promise<ProductFamilyProductState> {
  const res = await api.get<ProductFamilyProductState>(`/products/${productId}/family`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function attachProductFamily(
  tenantId: number,
  productId: number,
  productFamilyId: number | null,
): Promise<ProductFamilyProductState> {
  const res = await api.put<ProductFamilyProductState>(
    `/products/${productId}/family`,
    { product_family_id: productFamilyId },
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export type FamilyGenerateMode = "empty" | "copy_base";

export type FamilyGenerateCombination = {
  value_key: string;
  value_ids: number[];
  label: string;
  exists: boolean;
};

export type FamilyGeneratePreview = {
  family_id: number;
  family_name: string;
  attribute_count: number;
  combination_count: number;
  existing_count: number;
  missing_count: number;
  product_count: number;
  sku_count: number;
  catalog_count: number;
  new_sku_count: number;
  will_allocate_sku: boolean;
  will_allocate_catalog: boolean;
  has_base_product: boolean;
  base_product?: { id: number; name: string; primary_category_id?: number | null } | null;
  default_mode: FamilyGenerateMode;
  combinations: FamilyGenerateCombination[];
};

export type FamilyGenerateResult = {
  created_count: number;
  allocated_sku_count?: number;
  allocated_catalog_count?: number;
  mode: string;
  products: ProductFamilyMember[];
  family?: ProductFamily | null;
};

export async function previewFamilyGenerate(
  tenantId: number,
  familyId: number,
): Promise<FamilyGeneratePreview> {
  const res = await api.get<FamilyGeneratePreview>(`/product-families/${familyId}/generate/preview`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function generateFamilyProducts(
  tenantId: number,
  familyId: number,
  body: {
    mode: FamilyGenerateMode;
    value_keys: string[];
    only_missing?: boolean;
  },
): Promise<FamilyGenerateResult> {
  const res = await api.post<FamilyGenerateResult>(`/product-families/${familyId}/generate`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}
