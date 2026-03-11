import api from "./axios";

export type TenantInventoryValueResponse = {
  tenant_id: number;
  total_inventory_value: number;
  warehouses?: { warehouse_id: number; value: number }[];
};

export type WarehouseInventoryValueResponse = {
  warehouse_id: number;
  inventory_value: number;
};

export type DeadStockItem = {
  product_id: number;
  product_name?: string;
  inventory_quantity: number;
  inventory_value: number;
  product_value_share: number;
  last_sale_date: string | null;
  days_since_last_sale: number | null;
  days_without_sales: number;
  sales_last_30_days: number;
  sales_last_90_days: number;
  rotation_rate: number;
  category: "FAST_MOVING" | "SLOW_MOVING" | "DEAD_STOCK";
};

export type DeadStockSummary = {
  fast_moving_value: number;
  slow_moving_value: number;
  dead_stock_value: number;
  total_inventory_value: number;
  fast_percentage: number;
  slow_percentage: number;
  dead_percentage: number;
};

export type DeadStockResponse = {
  items: DeadStockItem[];
  summary: DeadStockSummary;
};

export type ProductRotationItem = {
  product_id: number;
  product_name?: string;
  total_quantity: number;
};

export type PickDensityItem = {
  location_id: number;
  location_name?: string;
  total_quantity: number;
};

export async function getTenantInventoryValue(
  tenantId: number,
  breakdown = true
): Promise<TenantInventoryValueResponse> {
  const { data } = await api.get<TenantInventoryValueResponse>(
    `/tenants/${tenantId}/inventory-value/`,
    { params: { breakdown } }
  );
  return data;
}

export async function getWarehouseInventoryValue(
  warehouseId: number
): Promise<WarehouseInventoryValueResponse> {
  const { data } = await api.get<WarehouseInventoryValueResponse>(
    `/warehouses/${warehouseId}/inventory-value/`
  );
  return data;
}

export type DeadStockParams = {
  tenantId: number;
  days?: number;
  name?: string;
  ean?: string;
  sku?: string;
  salesStartDate?: string;
  salesEndDate?: string;
  limit?: number;
};

export async function getDeadStock(
  tenantId: number,
  days = 90,
  params?: Omit<DeadStockParams, "tenantId" | "days"> & { days?: number }
): Promise<DeadStockResponse> {
  const query: Record<string, string | number> = {
    tenant_id: tenantId,
    days: params?.days ?? days,
  };
  if (params?.name != null && params.name !== "") query.name = params.name;
  if (params?.ean != null && params.ean !== "") query.ean = params.ean;
  if (params?.sku != null && params.sku !== "") query.sku = params.sku;
  if (params?.salesStartDate != null && params.salesStartDate !== "") query.sales_start_date = params.salesStartDate;
  if (params?.salesEndDate != null && params.salesEndDate !== "") query.sales_end_date = params.salesEndDate;
  if (params?.limit != null) query.limit = params.limit;
  const { data } = await api.get<DeadStockResponse>("/analysis/dead-stock/", { params: query });
  if (data && typeof data === "object" && Array.isArray(data.items) && data.summary) {
    return data;
  }
  return { items: [], summary: { fast_moving_value: 0, slow_moving_value: 0, dead_stock_value: 0, total_inventory_value: 0, fast_percentage: 0, slow_percentage: 0, dead_percentage: 0 } };
}

export type ProductFiltersParams = {
  name?: string;
  ean?: string;
  sku?: string;
  limit?: number;
};

export async function getProductRotation(
  tenantId: number,
  params?: ProductFiltersParams
): Promise<ProductRotationItem[]> {
  const query: Record<string, string | number> = { tenant_id: tenantId };
  if (params?.name != null && params.name !== "") query.name = params.name;
  if (params?.ean != null && params.ean !== "") query.ean = params.ean;
  if (params?.sku != null && params.sku !== "") query.sku = params.sku;
  if (params?.limit != null) query.limit = params.limit;
  const { data } = await api.get<ProductRotationItem[]>("/analysis/product-rotation/", {
    params: query,
  });
  return Array.isArray(data) ? data : [];
}

export async function getHotProducts(
  tenantId: number,
  params?: ProductFiltersParams & { limit?: number }
): Promise<ProductRotationItem[]> {
  const query: Record<string, string | number> = { tenant_id: tenantId };
  if (params?.name != null && params.name !== "") query.name = params.name;
  if (params?.ean != null && params.ean !== "") query.ean = params.ean;
  if (params?.sku != null && params.sku !== "") query.sku = params.sku;
  if (params?.limit != null) query.limit = params.limit;
  const { data } = await api.get<ProductRotationItem[]>("/analysis/hot-products/", {
    params: query,
  });
  return Array.isArray(data) ? data : [];
}

export async function getPickDensity(
  tenantId: number,
  warehouseId?: number
): Promise<PickDensityItem[]> {
  const { data } = await api.get<PickDensityItem[]>("/analysis/pick-density/", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId ?? undefined },
  });
  return Array.isArray(data) ? data : [];
}

export type ProductPairItem = {
  product_id_a: number;
  product_id_b: number;
  product_name_a?: string;
  product_name_b?: string;
  frequency: number;
};

export async function getProductPairs(
  tenantId: number,
  limit = 50
): Promise<ProductPairItem[]> {
  const { data } = await api.get<ProductPairItem[]>("/analysis/product-pairs/", {
    params: { tenant_id: tenantId, limit },
  });
  return Array.isArray(data) ? data : [];
}

export type HotLocationItem = {
  location_id: number;
  location_name?: string;
  total_quantity: number;
  current_stock?: number;
};

export async function getHotLocations(
  tenantId: number,
  warehouseId?: number,
  limit = 100
): Promise<HotLocationItem[]> {
  const { data } = await api.get<HotLocationItem[]>("/analysis/hot-locations/", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId ?? undefined, limit },
  });
  return Array.isArray(data) ? data : [];
}

export type PickingAnalysisSummary = {
  total_picks: number;
  total_picked_quantity: number;
  avg_picks_per_order: number;
  avg_locations_per_order: number;
};

export type PickingAnalysisPickRow = {
  id: number;
  order_id: number;
  product_name?: string;
  sku?: string;
  location_name?: string;
  quantity: number;
  picked_at: string | null;
};

export type PickingAnalysisHeatmapItem = {
  location_id: number;
  location_name?: string;
  x: number | null;
  y: number | null;
  total_picks: number;
  total_quantity: number;
  unique_orders: number;
  products_picked: number;
};

export type PickingAnalysisFilters = {
  product_name?: string;
  sku?: string;
  ean?: string;
  location?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
};

export async function getPickingAnalysisSummary(
  tenantId: number,
  warehouseId?: number
): Promise<PickingAnalysisSummary> {
  const { data } = await api.get<PickingAnalysisSummary>(
    "/analysis/picking-analysis/summary/",
    { params: { tenant_id: tenantId, warehouse_id: warehouseId ?? undefined } }
  );
  return (
    data ?? {
      total_picks: 0,
      total_picked_quantity: 0,
      avg_picks_per_order: 0,
      avg_locations_per_order: 0,
    }
  );
}

export async function getPickingAnalysisPicks(
  tenantId: number,
  warehouseId?: number,
  filters?: PickingAnalysisFilters
): Promise<PickingAnalysisPickRow[]> {
  const params: Record<string, string | number | undefined> = {
    tenant_id: tenantId,
    warehouse_id: warehouseId ?? undefined,
  };
  if (filters?.product_name != null && filters.product_name !== "")
    params.product_name = filters.product_name;
  if (filters?.sku != null && filters.sku !== "") params.sku = filters.sku;
  if (filters?.ean != null && filters.ean !== "") params.ean = filters.ean;
  if (filters?.location != null && filters.location !== "") params.location = filters.location;
  if (filters?.date_from != null && filters.date_from !== "")
    params.date_from = filters.date_from;
  if (filters?.date_to != null && filters.date_to !== "") params.date_to = filters.date_to;
  if (filters?.limit != null) params.limit = filters.limit;
  const { data } = await api.get<PickingAnalysisPickRow[]>(
    "/analysis/picking-analysis/picks/",
    { params }
  );
  return Array.isArray(data) ? data : [];
}

export async function getPickingAnalysisHeatmap(
  tenantId: number,
  warehouseId?: number
): Promise<PickingAnalysisHeatmapItem[]> {
  const { data } = await api.get<PickingAnalysisHeatmapItem[]>(
    "/analysis/picking-analysis/heatmap/",
    { params: { tenant_id: tenantId, warehouse_id: warehouseId ?? undefined } }
  );
  return Array.isArray(data) ? data : [];
}

export type GenerateSimulatedPicksResponse = {
  created: number;
  orders_processed: number;
};

export async function generateSimulatedPicks(
  tenantId: number,
  warehouseId: number,
  replaceExisting = true
): Promise<GenerateSimulatedPicksResponse> {
  const { data } = await api.post<GenerateSimulatedPicksResponse>(
    "/analysis/picking-analysis/generate-simulated-picks/",
    null,
    {
      params: {
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        replace_existing: replaceExisting,
      },
    }
  );
  return data ?? { created: 0, orders_processed: 0 };
}

export type DeleteSimulatedPicksResponse = { deleted: number };

export async function deleteSimulatedPicks(
  tenantId: number,
  warehouseId: number
): Promise<DeleteSimulatedPicksResponse> {
  const { data } = await api.delete<DeleteSimulatedPicksResponse>(
    "/analysis/picking-analysis/picks/",
    { params: { tenant_id: tenantId, warehouse_id: warehouseId } }
  );
  return data ?? { deleted: 0 };
}

export type BatchPickingItem = {
  product_id: number;
  product_name?: string;
  total_picks: number;
};

export async function getBatchPicking(
  tenantId: number,
  params?: ProductFiltersParams
): Promise<BatchPickingItem[]> {
  const query: Record<string, string | number> = { tenant_id: tenantId };
  if (params?.name != null && params.name !== "") query.name = params.name;
  if (params?.ean != null && params.ean !== "") query.ean = params.ean;
  if (params?.sku != null && params.sku !== "") query.sku = params.sku;
  if (params?.limit != null) query.limit = params.limit;
  const { data } = await api.get<BatchPickingItem[]>("/analysis/batch-picking/", {
    params: query,
  });
  return Array.isArray(data) ? data : [];
}

export type WalkingCostItem = {
  order_id: number;
  order_number?: string;
  total_distance: number;
  distinct_locations_count: number;
  total_items: number;
};

export async function getWalkingCost(
  tenantId: number,
  warehouseId?: number
): Promise<WalkingCostItem[]> {
  const { data } = await api.get<WalkingCostItem[]>("/analysis/walking-cost/", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId ?? undefined },
  });
  return Array.isArray(data) ? data : [];
}

export type SalesForecastHistoryItem = { date: string; orders: number; items?: number };
export type SalesForecastItem = { date: string; predicted_orders: number };
export type SalesForecastResponse = {
  history: SalesForecastHistoryItem[];
  forecast: SalesForecastItem[];
  message?: string;
  weekday_pattern?: Record<string, number>;
};

export async function getSalesForecast(
  warehouseId: number
): Promise<SalesForecastResponse> {
  const { data } = await api.get<SalesForecastResponse>(
    `/analysis/sales-forecast/${warehouseId}`
  );
  return data ?? { history: [], forecast: [] };
}

export type ProductForecastHistoryItem = { date: string; quantity: number };
export type ProductForecastItem = { date: string; predicted_quantity: number };
export type ProductForecastResponse = {
  product_id: number;
  history: ProductForecastHistoryItem[];
  forecast: ProductForecastItem[];
  message?: string;
};

export async function getProductForecast(
  productId: number
): Promise<ProductForecastResponse> {
  const { data } = await api.get<ProductForecastResponse>(
    `/analysis/product-forecast/${productId}`
  );
  return data ?? { product_id: productId, history: [], forecast: [] };
}

export type SlottingProduct = {
  product_id: number;
  product_name: string | null;
  symbol: string | null;
  velocity: number;
  cube: number;
  coi: number | null;
  abc_class: "A" | "B" | "C";
  distance_to_packing: number;
  slotting_score: number;
  current_location: string | null;
  recommended_zone: string;
  location_id?: number;
  location_x?: number;
  location_y?: number;
};

export type SlottingResponse = {
  packing_location: { x: number; y: number } | null;
  products: SlottingProduct[];
};

export type SlottingParams = {
  name?: string;
  ean?: string;
  sku?: string;
  limit?: number;
};

export async function getSlotting(
  warehouseId: number,
  params?: SlottingParams
): Promise<SlottingResponse> {
  const query: Record<string, string | number> = {};
  if (params?.name != null && params.name !== "") query.name = params.name;
  if (params?.ean != null && params.ean !== "") query.ean = params.ean;
  if (params?.sku != null && params.sku !== "") query.sku = params.sku;
  if (params?.limit != null) query.limit = params.limit;
  const { data } = await api.get<SlottingResponse>(
    `/analysis/slotting/${warehouseId}`,
    { params: Object.keys(query).length ? query : undefined }
  );
  return data ?? { packing_location: null, products: [] };
}

export type PickingStrategyResult = {
  strategy_name: string;
  total_walking_distance: number;
  estimated_picking_time: number;
  estimated_packing_time: number;
  required_picker_count: number;
  orders_per_hour: number;
};

export type PickingStrategyResponse = {
  strategies: PickingStrategyResult[];
  orders_used: number;
  total_items: number;
  avg_items_per_order: number;
};

export async function getPickingStrategy(
  warehouseId: number,
  tenantId = 1,
  options?: { limit?: number; startDate?: string; endDate?: string }
): Promise<PickingStrategyResponse> {
  const params: Record<string, string | number> = { tenant_id: tenantId };
  if (options?.startDate != null && options?.endDate != null) {
    params.start_date = options.startDate;
    params.end_date = options.endDate;
  } else {
    params.limit = options?.limit ?? 100;
  }
  const { data } = await api.get<PickingStrategyResponse>(
    `/analysis/picking-strategy/${warehouseId}`,
    { params }
  );
  return (
    data ?? {
      strategies: [],
      orders_used: 0,
      total_items: 0,
      avg_items_per_order: 0,
    }
  );
}
