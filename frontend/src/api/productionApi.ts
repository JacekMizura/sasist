import api from "./axios";

export type ProductionRecipeLineRead = {
  id: number;
  component_product_id: number;
  quantity: number;
  waste_percent: number;
  sort_order: number;
  notes?: string | null;
  product_name?: string | null;
  product_sku?: string | null;
  product_stock?: number | null;
};

export type ProductionRecipeRead = {
  id: number;
  tenant_id: number;
  product_id: number;
  name: string;
  version: string;
  is_active: boolean;
  yield_quantity: number;
  notes?: string | null;
  product_name?: string | null;
  product_sku?: string | null;
  lines: ProductionRecipeLineRead[];
  created_at?: string | null;
  updated_at?: string | null;
};

export type ProductionRecipeLineWrite = {
  component_product_id: number;
  quantity: number;
  waste_percent?: number;
  sort_order?: number;
  notes?: string | null;
};

export type ProductionRecipeCreateBody = {
  product_id: number;
  name: string;
  version?: string;
  yield_quantity?: number;
  notes?: string | null;
  is_active?: boolean;
  lines: ProductionRecipeLineWrite[];
};

export type ProductionRecipeUpdateBody = Partial<
  Omit<ProductionRecipeCreateBody, "product_id">
>;

export type RecipeUsageRead = {
  recipe_id: number;
  recipe_name: string;
  finished_product_id: number;
  finished_product_name: string;
  quantity: number;
};

export type ProductionOrderStatus =
  | "draft"
  | "planned"
  | "in_progress"
  | "completed"
  | "cancelled";

export type ProductionOrderLineSnapshotRead = {
  id: number;
  component_product_id: number;
  quantity_per_unit: number;
  total_required_quantity: number;
  consumed_quantity: number;
  product_name_snapshot: string;
  product_sku_snapshot?: string | null;
  available?: number | null;
  missing?: number | null;
  reserved?: number | null;
};

export type ProductionOrderRead = {
  id: number;
  tenant_id: number;
  number: string;
  recipe_id: number;
  product_id: number;
  warehouse_id: number;
  location_id?: number | null;
  planned_quantity: number;
  produced_quantity: number;
  status: ProductionOrderStatus;
  priority: number;
  notes?: string | null;
  calculated_unit_cost?: number | null;
  rw_stock_document_id?: number | null;
  pw_stock_document_id?: number | null;
  product_name?: string | null;
  product_sku?: string | null;
  warehouse_name?: string | null;
  location_name?: string | null;
  recipe_name?: string | null;
  lines: ProductionOrderLineSnapshotRead[];
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ProductionOrderCreateBody = {
  recipe_id: number;
  warehouse_id: number;
  location_id?: number | null;
  planned_quantity: number;
  priority?: number;
  notes?: string | null;
  status?: ProductionOrderStatus;
};

export type ProductionOrderCompleteBody = {
  produced_quantity?: number;
  location_id?: number | null;
};

export type ProductionCompleteResultRead = {
  order: ProductionOrderRead;
  rw_stock_document_id?: number | null;
  pw_stock_document_id?: number | null;
  calculated_unit_cost?: number | null;
};

export async function listRecipesForProduct(
  tenantId: number,
  productId: number,
): Promise<ProductionRecipeRead[]> {
  const res = await api.get<ProductionRecipeRead[]>(
    `/production/recipes/by-product/${productId}`,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function getRecipe(
  tenantId: number,
  recipeId: number,
): Promise<ProductionRecipeRead> {
  const res = await api.get<ProductionRecipeRead>(`/production/recipes/${recipeId}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function createRecipe(
  tenantId: number,
  body: ProductionRecipeCreateBody,
): Promise<ProductionRecipeRead> {
  const res = await api.post<ProductionRecipeRead>("/production/recipes", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function updateRecipe(
  tenantId: number,
  recipeId: number,
  body: ProductionRecipeUpdateBody,
): Promise<ProductionRecipeRead> {
  const res = await api.put<ProductionRecipeRead>(`/production/recipes/${recipeId}`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function activateRecipe(
  tenantId: number,
  recipeId: number,
  active = true,
): Promise<ProductionRecipeRead> {
  const res = await api.post<ProductionRecipeRead>(
    `/production/recipes/${recipeId}/activate`,
    null,
    { params: { tenant_id: tenantId, active } },
  );
  return res.data;
}

export async function cloneRecipe(
  tenantId: number,
  recipeId: number,
  version: string,
): Promise<ProductionRecipeRead> {
  const res = await api.post<ProductionRecipeRead>(
    `/production/recipes/${recipeId}/clone`,
    null,
    { params: { tenant_id: tenantId, version } },
  );
  return res.data;
}

export async function listRecipeUsages(
  tenantId: number,
  productId: number,
): Promise<RecipeUsageRead[]> {
  const res = await api.get<RecipeUsageRead[]>(
    `/production/recipes/usages/by-product/${productId}`,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function listProductionOrders(
  tenantId: number,
  opts?: { status?: ProductionOrderStatus; warehouse_id?: number },
): Promise<ProductionOrderRead[]> {
  const res = await api.get<ProductionOrderRead[]>("/production/orders", {
    params: { tenant_id: tenantId, ...opts },
  });
  return res.data;
}

export async function getProductionOrder(
  tenantId: number,
  orderId: number,
): Promise<ProductionOrderRead> {
  const res = await api.get<ProductionOrderRead>(`/production/orders/${orderId}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function createProductionOrder(
  tenantId: number,
  body: ProductionOrderCreateBody,
): Promise<ProductionOrderRead> {
  const res = await api.post<ProductionOrderRead>("/production/orders", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function startProductionOrder(
  tenantId: number,
  orderId: number,
): Promise<ProductionOrderRead> {
  const res = await api.post<ProductionOrderRead>(
    `/production/orders/${orderId}/start`,
    null,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function completeProductionOrder(
  tenantId: number,
  orderId: number,
  body: ProductionOrderCompleteBody = {},
): Promise<ProductionCompleteResultRead> {
  const res = await api.post<ProductionCompleteResultRead>(
    `/production/orders/${orderId}/complete`,
    body,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function cancelProductionOrder(
  tenantId: number,
  orderId: number,
): Promise<ProductionOrderRead> {
  const res = await api.post<ProductionOrderRead>(
    `/production/orders/${orderId}/cancel`,
    null,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}
