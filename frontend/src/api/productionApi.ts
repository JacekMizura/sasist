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

export type ProductionBatchStatus =
  | "draft"
  | "planned"
  | "collecting"
  | "in_progress"
  | "putaway"
  | "completed"
  | "cancelled";

export type ProductionBatchLineRead = {
  id: number;
  product_id: number;
  composition_id: number;
  planned_quantity: number;
  completed_quantity: number;
  target_location_id?: number | null;
  target_location_name?: string | null;
  status: string;
  calculated_unit_cost?: number | null;
  pw_stock_document_id?: number | null;
  product_name?: string | null;
  product_sku?: string | null;
  composition_name?: string | null;
  notes?: string | null;
};

export type ProductionBatchRead = {
  id: number;
  tenant_id: number;
  number: string;
  warehouse_id: number;
  warehouse_name?: string | null;
  status: ProductionBatchStatus;
  notes?: string | null;
  rw_stock_document_id?: number | null;
  rw_document_number?: string | null;
  operator_name?: string | null;
  lines: ProductionBatchLineRead[];
  products_count?: number;
  total_planned_units?: number;
  total_completed_units?: number;
  has_shortages?: boolean;
  progress_percent?: number;
  collection_progress_percent?: number;
  started_at?: string | null;
  collecting_completed_at?: string | null;
  production_completed_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ProductionBatchLineWrite = {
  product_id: number;
  composition_id: number;
  planned_quantity: number;
  target_location_id?: number | null;
  notes?: string | null;
};

export type ProductionBatchCreateBody = {
  warehouse_id: number;
  notes?: string | null;
  status?: ProductionBatchStatus;
  lines: ProductionBatchLineWrite[];
};

export type BatchAggregatedPickLineRead = {
  component_product_id: number;
  product_name: string;
  product_sku?: string | null;
  required: number;
  available: number;
  missing: number;
  suggested_locations: ProductionLocationSuggestionRead[];
  auto_allocation: ProductionAllocationRead[];
};

export type ProductionBatchPickPlanRead = {
  batch_id: number;
  warehouse_id: number;
  shortages: StockShortageRead[];
  has_shortages: boolean;
  aggregated_components: BatchAggregatedPickLineRead[];
  product_lines: ProductionBatchLineRead[];
};

export type ProductionBatchCompleteBody = {
  component_allocations?: ComponentAllocationWrite[];
  line_completions?: { line_id: number; completed_quantity: number; target_location_id?: number | null }[];
};

export type ProductionBatchCompleteResultRead = {
  batch: ProductionBatchRead;
  rw_stock_document_id?: number | null;
  rw_document_number?: string | null;
  component_total_cost?: number | null;
};

export async function listProductionBatches(
  tenantId: number,
  opts?: { status?: ProductionBatchStatus; warehouse_id?: number },
): Promise<ProductionBatchRead[]> {
  const res = await api.get<ProductionBatchRead[]>("/production/batches", {
    params: { tenant_id: tenantId, ...opts },
  });
  return res.data;
}

export async function getProductionBatch(
  tenantId: number,
  batchId: number,
): Promise<ProductionBatchRead> {
  const res = await api.get<ProductionBatchRead>(`/production/batches/${batchId}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function fetchBatchPickPlan(
  tenantId: number,
  batchId: number,
): Promise<ProductionBatchPickPlanRead> {
  const res = await api.get<ProductionBatchPickPlanRead>(`/production/batches/${batchId}/pick-plan`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function previewProductionBatch(
  tenantId: number,
  body: ProductionBatchCreateBody,
): Promise<ProductionBatchPreviewRead> {
  const res = await api.post<ProductionBatchPreviewRead>("/production/batches/preview", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function createProductionBatch(
  tenantId: number,
  body: ProductionBatchCreateBody,
): Promise<ProductionBatchRead> {
  const res = await api.post<ProductionBatchRead>("/production/batches", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function startProductionBatch(
  tenantId: number,
  batchId: number,
): Promise<ProductionBatchRead> {
  const res = await api.post<ProductionBatchRead>(`/production/batches/${batchId}/start`, null, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function completeProductionBatch(
  tenantId: number,
  batchId: number,
  body: ProductionBatchCompleteBody = {},
): Promise<ProductionBatchCompleteResultRead> {
  const res = await api.post<ProductionBatchCompleteResultRead>(
    `/production/batches/${batchId}/complete`,
    body,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function cancelProductionBatch(
  tenantId: number,
  batchId: number,
): Promise<ProductionBatchRead> {
  const res = await api.post<ProductionBatchRead>(`/production/batches/${batchId}/cancel`, null, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export type RecipeCardRead = {
  composition_id: number;
  product_id: number;
  product_name: string;
  product_sku?: string | null;
  product_image_url?: string | null;
  recipe_name: string;
  version: string;
  is_active: boolean;
  component_count: number;
  unit_cost_net?: number | null;
  current_stock: number;
  max_producible: number;
  has_low_stock: boolean;
  status_badge: string;
};

export type RecipeComponentDetailRead = {
  component_product_id: number;
  product_name: string;
  product_sku?: string | null;
  product_image_url?: string | null;
  required_per_unit: number;
  available: number;
  shortage: number;
  unit_cost_net?: number | null;
  line_cost_net?: number | null;
  suggested_locations: string[];
};

export type RecipeDetailRead = {
  composition_id: number;
  product_id: number;
  product_name: string;
  product_sku?: string | null;
  product_image_url?: string | null;
  recipe_name: string;
  version: string;
  is_active: boolean;
  yield_quantity: number;
  current_stock: number;
  unit_cost_net?: number | null;
  margin_hint?: number | null;
  max_producible: number;
  components: RecipeComponentDetailRead[];
  total_cost_net?: number | null;
  has_shortages: boolean;
  shortage_summary: string[];
};

export type ProductionBatchSummaryRead = {
  id: number;
  number: string;
  status: ProductionBatchStatus;
  products_count: number;
  total_planned_units: number;
  progress_percent: number;
  has_shortages: boolean;
  operator_name?: string | null;
  priority?: string;
  planned_date?: string | null;
  created_at?: string | null;
  product_labels: string[];
  product_image_urls?: string[];
  shortage_count?: number;
};

export type ProductionDashboardRead = {
  planned_batches: number;
  active_batches: number;
  waiting_batches: number;
  batches_with_shortages: number;
  finished_today: number;
  production_efficiency_percent: number;
  collecting_batches: number;
  in_production_batches: number;
  putaway_batches: number;
  recipe_count: number;
  active_operators?: string[];
  planned: ProductionBatchSummaryRead[];
  in_progress: ProductionBatchSummaryRead[];
  active: ProductionBatchSummaryRead[];
  waiting_materials: ProductionBatchSummaryRead[];
  ready_to_produce: ProductionBatchSummaryRead[];
  recently_completed: ProductionBatchSummaryRead[];
};

export type ProductionBatchPreviewRead = {
  has_shortages: boolean;
  total_planned_units: number;
  products_count: number;
  estimated_cost_net?: number;
  estimated_duration_minutes?: number;
  aggregated_components: BatchAggregatedPickLineRead[];
  shortages: StockShortageRead[];
};

export type CollectionTaskRead = {
  task_key: string;
  component_product_id: number;
  product_name: string;
  product_sku?: string | null;
  product_image_url?: string | null;
  location_id: number;
  location_code: string;
  required_qty: number;
  collected_qty: number;
};

export type BatchCollectionStateRead = {
  batch_id: number;
  status: string;
  tasks: CollectionTaskRead[];
  collected_count: number;
  total_count: number;
  progress_percent: number;
};

export async function fetchProductionDashboard(
  tenantId: number,
  warehouseId?: number,
): Promise<ProductionDashboardRead> {
  const res = await api.get<ProductionDashboardRead>("/production/dashboard", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function listRecipeCards(
  tenantId: number,
  warehouseId?: number,
): Promise<RecipeCardRead[]> {
  const res = await api.get<RecipeCardRead[]>("/production/recipes", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function getRecipeDetail(
  tenantId: number,
  compositionId: number,
  warehouseId?: number,
): Promise<RecipeDetailRead> {
  const res = await api.get<RecipeDetailRead>(`/production/recipes/${compositionId}`, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function startCollectingBatch(tenantId: number, batchId: number) {
  const res = await api.post<ProductionBatchRead>(`/production/batches/${batchId}/start-collecting`, null, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function fetchCollectionState(tenantId: number, batchId: number) {
  const res = await api.get<BatchCollectionStateRead>(`/production/batches/${batchId}/collection`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function updateCollectionTask(
  tenantId: number,
  batchId: number,
  body: { task_key: string; collected_qty: number },
) {
  const res = await api.post<BatchCollectionStateRead>(
    `/production/batches/${batchId}/collection/update`,
    body,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function finishCollectingBatch(tenantId: number, batchId: number) {
  const res = await api.post<ProductionBatchRead>(`/production/batches/${batchId}/finish-collecting`, null, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function updateProductionProgress(
  tenantId: number,
  batchId: number,
  body: { line_id: number; add_quantity: number },
) {
  const res = await api.post<ProductionBatchRead>(`/production/batches/${batchId}/production-progress`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function finishProductionPhase(tenantId: number, batchId: number) {
  const res = await api.post<ProductionBatchRead>(`/production/batches/${batchId}/finish-production`, null, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function finishPutawayBatch(
  tenantId: number,
  batchId: number,
  body: { lines: { line_id: number; target_location_id: number; quantity?: number }[] },
) {
  const res = await api.post<ProductionBatchCompleteResultRead>(
    `/production/batches/${batchId}/finish-putaway`,
    body,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}
