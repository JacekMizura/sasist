import api from "./axios";

export type MaterialProductionStatus = "OK" | "PARTIAL" | "BLOCKED";
export type ShortagePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type MaterialLocationHint = {
  location_id: number;
  location_code: string;
  available_qty: number;
};

export type SubstituteProposal = {
  substitute_product_id: number;
  substitute_product_name: string;
  substitute_product_sku?: string | null;
  priority: number;
  conversion_ratio: number;
  available_qty: number;
  effective_qty: number;
  can_cover_shortage: boolean;
};

export type MaterialShortageDetail = {
  component_product_id: number;
  product_name: string;
  product_sku?: string | null;
  required_qty: number;
  available_qty: number;
  missing_qty: number;
  locations: MaterialLocationHint[];
  expected_availability_date?: string | null;
  substitute_proposals: SubstituteProposal[];
};

export type MaterialAnalysis = {
  planned_quantity: number;
  material_status: MaterialProductionStatus;
  producible_now_qty: number;
  waiting_qty: number;
  has_shortages: boolean;
  components: MaterialShortageDetail[];
};

export type ProductionShortageQueueRow = {
  component_product_id: number;
  product_name: string;
  product_sku?: string | null;
  missing_qty: number;
  required_qty?: number | null;
  available_qty?: number | null;
  blocked_batches_count: number;
  blocked_orders_count: number;
  blocked_batch_ids: number[];
  blocked_order_ids: number[];
  priority: ShortagePriority;
  locations: MaterialLocationHint[];
  expected_availability_date?: string | null;
  substitute_proposals: SubstituteProposal[];
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

export async function analyzeProductionMaterials(
  tenantId: number,
  warehouseId: number,
  body: { composition_id: number; planned_quantity: number },
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
