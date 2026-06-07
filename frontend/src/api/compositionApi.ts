import api from "./axios";

export type CompositionMode = "bundle" | "manufacturing";

export type CompositionLineRead = {
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

export type ProductCompositionRead = {
  id: number;
  tenant_id: number;
  product_id: number;
  composition_mode: CompositionMode;
  name: string;
  version: string;
  is_active: boolean;
  yield_quantity: number;
  notes?: string | null;
  product_name?: string | null;
  product_sku?: string | null;
  lines: CompositionLineRead[];
  created_at?: string | null;
  updated_at?: string | null;
};

export type CompositionLineWrite = {
  component_product_id: number;
  quantity: number;
  waste_percent?: number;
  sort_order?: number;
  notes?: string | null;
};

export type ProductCompositionCreateBody = {
  product_id: number;
  composition_mode: CompositionMode;
  name: string;
  version?: string;
  yield_quantity?: number;
  notes?: string | null;
  is_active?: boolean;
  lines: CompositionLineWrite[];
};

export type ProductCompositionUpdateBody = Partial<
  Omit<ProductCompositionCreateBody, "product_id" | "composition_mode">
>;

export type CompositionUsageRead = {
  composition_id: number;
  composition_name: string;
  composition_mode: CompositionMode;
  parent_product_id: number;
  parent_product_name: string;
  quantity: number;
};

export type CompositionCostEstimateRead = {
  composition_id: number;
  unit_cost_net: number;
  lines: {
    component_product_id: number;
    product_name: string;
    quantity: number;
    unit_cost_net: number;
    line_cost_net: number;
  }[];
};

export async function listCompositionsForProduct(
  tenantId: number,
  productId: number,
  mode?: CompositionMode,
): Promise<ProductCompositionRead[]> {
  const res = await api.get<ProductCompositionRead[]>(`/compositions/by-product/${productId}`, {
    params: { tenant_id: tenantId, mode },
  });
  return res.data;
}

export async function getComposition(
  tenantId: number,
  compositionId: number,
): Promise<ProductCompositionRead> {
  const res = await api.get<ProductCompositionRead>(`/compositions/${compositionId}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function createComposition(
  tenantId: number,
  body: ProductCompositionCreateBody,
): Promise<ProductCompositionRead> {
  const res = await api.post<ProductCompositionRead>("/compositions", body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function updateComposition(
  tenantId: number,
  compositionId: number,
  body: ProductCompositionUpdateBody,
): Promise<ProductCompositionRead> {
  const res = await api.put<ProductCompositionRead>(`/compositions/${compositionId}`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function activateComposition(
  tenantId: number,
  compositionId: number,
  active = true,
): Promise<ProductCompositionRead> {
  const res = await api.post<ProductCompositionRead>(
    `/compositions/${compositionId}/activate`,
    null,
    { params: { tenant_id: tenantId, active } },
  );
  return res.data;
}

export async function listCompositionUsages(
  tenantId: number,
  productId: number,
): Promise<CompositionUsageRead[]> {
  const res = await api.get<CompositionUsageRead[]>(`/compositions/usages/by-product/${productId}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function fetchCompositionCostEstimate(
  tenantId: number,
  compositionId: number,
): Promise<CompositionCostEstimateRead> {
  const res = await api.get<CompositionCostEstimateRead>(
    `/compositions/${compositionId}/cost-estimate`,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}
