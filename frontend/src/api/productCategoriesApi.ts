import api from "./axios";

export type ProductCategoryTreeNode = {
  id: number;
  parent_id: number | null;
  name: string;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
  product_count: number;
  path_ids: number[];
  path_names: string[];
  children: ProductCategoryTreeNode[];
};

export type ProductCategoryRead = {
  id: number;
  tenant_id: number;
  parent_id: number | null;
  name: string;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
  product_count: number;
  child_count: number;
  path_ids: number[];
  path_names: string[];
};

export type ProductCategoryAssignment = {
  product_id: number;
  primary_category_id: number | null;
  primary_path_names: string[];
  primary_path_ids: number[];
  additional_category_ids: number[];
  additional: ProductCategoryRead[];
};

export type ProductCategoryCreateBody = {
  name: string;
  parent_id?: number | null;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number | null;
};

export type ProductCategoryUpdateBody = {
  name?: string;
  parent_id?: number | null;
  clear_parent?: boolean;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number | null;
};

export async function fetchCategoryTree(params: {
  tenantId: number;
  includeInactive?: boolean;
}): Promise<ProductCategoryTreeNode[]> {
  const { data } = await api.get<{ nodes: ProductCategoryTreeNode[] }>("/product-categories/tree", {
    params: {
      tenant_id: params.tenantId,
      include_inactive: params.includeInactive ?? true,
    },
  });
  return data.nodes ?? [];
}

export async function createProductCategory(params: {
  tenantId: number;
  body: ProductCategoryCreateBody;
}): Promise<ProductCategoryRead> {
  const { data } = await api.post<ProductCategoryRead>("/product-categories", params.body, {
    params: { tenant_id: params.tenantId },
  });
  return data;
}

export async function updateProductCategory(params: {
  tenantId: number;
  categoryId: number;
  body: ProductCategoryUpdateBody;
}): Promise<ProductCategoryRead> {
  const { data } = await api.patch<ProductCategoryRead>(
    `/product-categories/${params.categoryId}`,
    params.body,
    { params: { tenant_id: params.tenantId } },
  );
  return data;
}

export async function moveProductCategory(params: {
  tenantId: number;
  categoryId: number;
  parentId: number | null;
  sortOrder: number;
  clearParent?: boolean;
}): Promise<ProductCategoryRead> {
  const { data } = await api.post<ProductCategoryRead>(
    `/product-categories/${params.categoryId}/move`,
    {
      parent_id: params.clearParent ? null : params.parentId,
      sort_order: params.sortOrder,
      clear_parent: Boolean(params.clearParent),
    },
    { params: { tenant_id: params.tenantId } },
  );
  return data;
}

export async function deleteProductCategory(params: {
  tenantId: number;
  categoryId: number;
}): Promise<void> {
  await api.delete(`/product-categories/${params.categoryId}`, {
    params: { tenant_id: params.tenantId },
  });
}

export async function getProductCategoryAssignment(params: {
  tenantId: number;
  productId: number;
}): Promise<ProductCategoryAssignment> {
  const { data } = await api.get<ProductCategoryAssignment>(
    `/products/${params.productId}/category-assignment`,
    { params: { tenant_id: params.tenantId } },
  );
  return data;
}

export async function putProductCategoryAssignment(params: {
  tenantId: number;
  productId: number;
  primaryCategoryId: number | null;
  additionalCategoryIds: number[];
}): Promise<ProductCategoryAssignment> {
  const { data } = await api.put<ProductCategoryAssignment>(
    `/products/${params.productId}/category-assignment`,
    {
      primary_category_id: params.primaryCategoryId,
      additional_category_ids: params.additionalCategoryIds,
    },
    { params: { tenant_id: params.tenantId } },
  );
  return data;
}
