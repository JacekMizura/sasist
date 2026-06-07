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
  rw_document_number?: string | null;
  pw_document_number?: string | null;
  component_total_cost?: number | null;
  operator_name?: string | null;
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

export type ComponentAllocationWrite = {
  line_snapshot_id: number;
  location_id: number;
  quantity: number;
};

export type ProductionOrderCompleteBody = {
  produced_quantity?: number;
  location_id?: number | null;
  component_allocations?: ComponentAllocationWrite[];
};

export type StockShortageRead = {
  component_product_id: number;
  product_name: string;
  required: number;
  available: number;
  missing: number;
};

export type ProductionLocationSuggestionRead = {
  location_id: number;
  code: string;
  available: number;
  operational_zone_type?: string | null;
  auto_pick_qty: number;
  is_suggested: boolean;
};

export type ProductionAllocationRead = {
  location_id: number;
  location_code: string;
  quantity: number;
};

export type ProductionPickLinePlanRead = {
  line_snapshot_id: number;
  component_product_id: number;
  product_name: string;
  product_sku?: string | null;
  required: number;
  available: number;
  missing: number;
  suggested_locations: ProductionLocationSuggestionRead[];
  auto_allocation: ProductionAllocationRead[];
};

export type ProductionPickPlanRead = {
  order_id: number;
  warehouse_id: number;
  shortages: StockShortageRead[];
  has_shortages: boolean;
  lines: ProductionPickLinePlanRead[];
};

export type RecipeLineCostRead = {
  component_product_id: number;
  product_name: string;
  quantity: number;
  waste_percent: number;
  unit_cost_net: number;
  line_cost_net: number;
};

export type RecipeCostEstimateRead = {
  recipe_id: number;
  yield_quantity: number;
  lines: RecipeLineCostRead[];
  total_cost_net: number;
  unit_cost_net: number;
};

export type ProductionOrderSummaryRead = {
  id: number;
  number: string;
  status: ProductionOrderStatus;
  planned_quantity: number;
  produced_quantity: number;
  calculated_unit_cost?: number | null;
  component_total_cost?: number | null;
  completed_at?: string | null;
  created_at?: string | null;
  operator_name?: string | null;
};

export type WarehouseLocationSearchRow = {
  id: number;
  code: string;
  operational_zone_type?: string | null;
};

export type ProductionCompleteResultRead = {
  order: ProductionOrderRead;
  rw_stock_document_id?: number | null;
  pw_stock_document_id?: number | null;
  rw_document_number?: string | null;
  pw_document_number?: string | null;
  calculated_unit_cost?: number | null;
  component_total_cost?: number | null;
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

export async function fetchProductionPickPlan(
  tenantId: number,
  orderId: number,
): Promise<ProductionPickPlanRead> {
  const res = await api.get<ProductionPickPlanRead>(`/production/orders/${orderId}/pick-plan`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function searchProductionLocations(
  tenantId: number,
  warehouseId: number,
  q: string,
  limit = 20,
): Promise<WarehouseLocationSearchRow[]> {
  const res = await api.get<WarehouseLocationSearchRow[]>("/production/locations/search", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, q, limit },
  });
  return res.data;
}

export async function fetchRecipeCostEstimate(
  tenantId: number,
  recipeId: number,
): Promise<RecipeCostEstimateRead> {
  const res = await api.get<RecipeCostEstimateRead>(`/production/recipes/${recipeId}/cost-estimate`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function listProductionOrdersForProduct(
  tenantId: number,
  productId: number,
  limit = 50,
): Promise<ProductionOrderSummaryRead[]> {
  const res = await api.get<ProductionOrderSummaryRead[]>(
    `/production/orders/by-product/${productId}`,
    { params: { tenant_id: tenantId, limit } },
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
