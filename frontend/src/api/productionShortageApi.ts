import api from "./axios";

export type MaterialProductionStatus = "OK" | "PARTIAL" | "BLOCKED";
export type ShortagePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type MaterialLotHint = {
  location_id: number;
  location_code: string;
  batch_number?: string | null;
  lot?: string | null;
  expiry_date?: string | null;
  on_hand_qty: number;
  reserved_qty: number;
  available_qty: number;
};

export type SubstituteProposal = {
  substitute_product_id: number;
  substitute_product_name: string;
  substitute_product_sku?: string | null;
  substitute_product_image_url?: string | null;
  priority: number;
  conversion_ratio: number;
  available_qty: number;
  effective_qty: number;
  can_cover_shortage: boolean;
  propose_use_substitute: boolean;
  technological_note?: string | null;
  requires_user_acceptance: boolean;
};

export type LimitingComponent = {
  component_product_id: number;
  product_name: string;
  product_sku?: string | null;
  product_image_url?: string | null;
  required_qty?: number;
  available_qty?: number;
  missing_qty?: number;
  max_producible_qty: number;
  substitute_proposals: SubstituteProposal[];
};

export type ProductionBlockMessage = {
  title: string;
  summary: string;
  detail_lines: string[];
  can_start: boolean;
  material_status: MaterialProductionStatus;
  planned_quantity: number;
  producible_now_qty: number;
  waiting_qty: number;
  limiting_component?: LimitingComponent | null;
};

export type MaterialShortageDetail = {
  component_product_id: number;
  product_name: string;
  product_sku?: string | null;
  product_image_url?: string | null;
  required_qty: number;
  on_hand_qty: number;
  reserved_qty: number;
  available_qty: number;
  missing_qty: number;
  locations: MaterialLotHint[];
  expected_availability_date?: string | null;
  substitute_proposals: SubstituteProposal[];
};

export type MaterialAnalysis = {
  composition_id?: number;
  product_id?: number;
  planned_quantity: number;
  material_status: MaterialProductionStatus;
  material_status_description: string;
  producible_now_qty: number;
  waiting_qty: number;
  has_shortages: boolean;
  can_start_production: boolean;
  limiting_component?: LimitingComponent | null;
  block_message?: ProductionBlockMessage | null;
  components: MaterialShortageDetail[];
  bom_explosion?: Record<string, unknown> | null;
  ai_recommendation_context?: Record<string, unknown> | null;
};

export type FinishedProductShortage = {
  product_id?: number | null;
  product_name: string;
  product_sku?: string | null;
  product_image_url?: string | null;
  batch_id?: number;
  order_id?: number;
  kind?: string;
};

export type ProductionShortageQueueRow = {
  component_product_id: number;
  product_name: string;
  product_sku?: string | null;
  product_image_url?: string | null;
  required_qty?: number | null;
  on_hand_qty?: number | null;
  reserved_qty?: number | null;
  available_qty?: number | null;
  missing_qty: number;
  blocked_batches_count: number;
  blocked_orders_count: number;
  blocked_batch_ids: number[];
  blocked_order_ids: number[];
  finished_products: FinishedProductShortage[];
  priority: ShortagePriority;
  locations: MaterialLotHint[];
  expected_availability_date?: string | null;
  substitute_proposals: SubstituteProposal[];
};

export type MaterialPortfolioRow = {
  component_product_id: number;
  product_name: string;
  product_sku?: string | null;
  product_image_url?: string | null;
  recipe_usage_count: number;
  recipe_line_references: number;
  blocked_productions_count: number;
  on_hand_qty: number;
  reserved_qty: number;
  available_qty: number;
  forecast_daily_usage: number;
  forecast_depletion_date?: string | null;
};

export type MaterialSubstitute = {
  id: number;
  product_id: number;
  product_name: string;
  product_sku?: string | null;
  substitute_product_id: number;
  substitute_product_name: string;
  substitute_product_sku?: string | null;
  priority: number;
  conversion_ratio: number;
  is_active: boolean;
  notes?: string | null;
};

export type PurchaseBridgeResult = {
  purchase_order_id: number;
  purchase_order_item_id: number;
  material_need_id: number;
  order_number: string;
  status: string;
};

export type RecipeVariant = {
  id: number;
  product_id: number;
  composition_id: number;
  variant_code: string;
  variant_label: string;
  priority: number;
  is_default: boolean;
  is_active: boolean;
  notes?: string | null;
};

export type MaterialNeedHistoryEvent = {
  event: string;
  at: string;
  status: string;
  covered_qty: number;
  detail?: Record<string, unknown>;
};

export type ProductionMaterialNeed = {
  id: number;
  warehouse_id: number;
  component_product_id: number;
  product_name: string;
  product_sku?: string | null;
  product_image_url?: string | null;
  shortage_qty: number;
  covered_qty: number;
  status: string;
  purchase_order_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  history: MaterialNeedHistoryEvent[];
};

export async function analyzeProductionMaterials(
  tenantId: number,
  warehouseId: number,
  body: {
    composition_id: number;
    planned_quantity: number;
    include_bom_explosion?: boolean;
    include_ai_context?: boolean;
    batch_id?: number;
    order_id?: number;
  },
): Promise<MaterialAnalysis> {
  const res = await api.post<MaterialAnalysis>("/production/shortages/analyze", body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function fetchProductionShortagesQueue(
  tenantId: number,
  warehouseId: number,
): Promise<ProductionShortageQueueRow[]> {
  const res = await api.get<ProductionShortageQueueRow[]>("/production/shortages", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function fetchMaterialPortfolio(
  tenantId: number,
  warehouseId: number,
): Promise<MaterialPortfolioRow[]> {
  const res = await api.get<MaterialPortfolioRow[]>("/production/material-analysis", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export type BomTreeNode = {
  product_id: number;
  product_name: string;
  product_sku?: string | null;
  product_image_url?: string | null;
  unit?: string | null;
  level: number;
  quantity_per_root: number;
  required_qty?: number;
  composition_id?: number | null;
  is_manufactured: boolean;
  material_status: "OK" | "PARTIAL" | "BLOCKED";
  on_hand_qty?: number | null;
  reserved_qty?: number | null;
  available_qty?: number | null;
  missing_qty?: number | null;
  locations: MaterialLotHint[];
  substitute_proposals: SubstituteProposal[];
  expected_availability_date?: string | null;
  children: BomTreeNode[];
};

export type BomTreeResponse = {
  composition_id: number;
  product_id: number;
  planned_quantity: number;
  tree: BomTreeNode;
};

export async function fetchBomTree(
  tenantId: number,
  warehouseId: number,
  compositionId: number,
  plannedQuantity = 1,
): Promise<BomTreeResponse> {
  const res = await api.get<BomTreeResponse>("/production/shortages/bom-tree", {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      composition_id: compositionId,
      planned_quantity: plannedQuantity,
    },
  });
  return res.data;
}

export async function explodeBom(
  tenantId: number,
  compositionId: number,
  plannedQuantity = 1,
): Promise<Record<string, unknown>> {
  const res = await api.get<Record<string, unknown>>("/production/shortages/explode-bom", {
    params: { tenant_id: tenantId, composition_id: compositionId, planned_quantity: plannedQuantity },
  });
  return res.data;
}

export async function fetchMaterialSubstitutes(
  tenantId: number,
  productId?: number,
): Promise<MaterialSubstitute[]> {
  const res = await api.get<MaterialSubstitute[]>("/production/material-substitutes", {
    params: { tenant_id: tenantId, ...(productId != null ? { product_id: productId } : {}) },
  });
  return res.data;
}

export async function createMaterialSubstitute(
  tenantId: number,
  body: {
    product_id: number;
    substitute_product_id: number;
    priority?: number;
    conversion_ratio?: number;
    is_active?: boolean;
    notes?: string | null;
  },
): Promise<MaterialSubstitute> {
  const res = await api.post<MaterialSubstitute>("/production/material-substitutes", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function updateMaterialSubstitute(
  tenantId: number,
  substituteId: number,
  body: {
    priority?: number;
    conversion_ratio?: number;
    is_active?: boolean;
    notes?: string | null;
  },
): Promise<MaterialSubstitute> {
  const res = await api.patch<MaterialSubstitute>(`/production/material-substitutes/${substituteId}`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function deleteMaterialSubstitute(tenantId: number, substituteId: number): Promise<void> {
  await api.delete(`/production/material-substitutes/${substituteId}`, {
    params: { tenant_id: tenantId },
  });
}

export async function acceptMaterialSubstitute(
  tenantId: number,
  warehouseId: number,
  body: {
    original_component_product_id: number;
    substitute_product_id: number;
    quantity_original: number;
    conversion_ratio?: number;
    batch_id?: number;
    order_id?: number;
    notes?: string;
  },
): Promise<{ id: number; status: string }> {
  const res = await api.post<{ id: number; status: string }>("/production/shortages/accept-substitute", body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function createPurchaseRequisitionFromShortage(
  tenantId: number,
  warehouseId: number,
  body: {
    component_product_id: number;
    quantity: number;
    supplier_id?: number;
    notes?: string;
    batch_id?: number;
    order_id?: number;
  },
): Promise<PurchaseBridgeResult> {
  const res = await api.post<PurchaseBridgeResult>("/production/shortages/purchase-requisition", body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function addShortageToPurchaseOrder(
  tenantId: number,
  warehouseId: number,
  body: {
    purchase_order_id: number;
    component_product_id: number;
    quantity: number;
    batch_id?: number;
    order_id?: number;
  },
): Promise<PurchaseBridgeResult> {
  const res = await api.post<PurchaseBridgeResult>("/production/shortages/add-to-purchase-order", body, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function fetchMaterialNeeds(
  tenantId: number,
  warehouseId: number,
  status?: string,
): Promise<ProductionMaterialNeed[]> {
  const res = await api.get<ProductionMaterialNeed[]>("/production/material-needs", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, status },
  });
  return res.data;
}

export async function fetchRecipeVariants(tenantId: number, productId?: number): Promise<RecipeVariant[]> {
  const res = await api.get<RecipeVariant[]>("/production/recipe-variants", {
    params: { tenant_id: tenantId, product_id: productId },
  });
  return res.data;
}

export async function assignRecipeVariant(
  tenantId: number,
  compositionId: number,
  variantCode: string,
): Promise<void> {
  await api.post(`/compositions/${compositionId}/assign-variant`, null, {
    params: { tenant_id: tenantId, variant_code: variantCode },
  });
}

export const MATERIAL_STATUS_DESCRIPTION: Record<MaterialProductionStatus, string> = {
  OK: "Wszystkie składniki dostępne w wymaganej ilości. Można zaplanować pełną produkcję.",
  PARTIAL:
    "Materiałów wystarcza tylko na część planu. System proponuje produkcję częściową — reszta oczekuje na uzupełnienie.",
  BLOCKED: "Brak kluczowych składników — pełna produkcja niemożliwa. Rozważ zamiennik lub zakup.",
};
