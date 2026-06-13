import api from "./axios";

export type OfferStockPoolWarehouseBrief = {
  id: number;
  name: string;
};

export type OfferStockPoolRead = {
  id: number;
  tenant_id: number;
  name: string;
  is_default: boolean;
  warehouse_ids: number[];
  warehouses: OfferStockPoolWarehouseBrief[];
  eligible_warehouse_ids: number[];
  eligible_warehouses: OfferStockPoolWarehouseBrief[];
};

export type OfferStockPoolsListOut = {
  items: OfferStockPoolRead[];
};

export async function listOfferStockPools(tenantId: number): Promise<OfferStockPoolRead[]> {
  const { data } = await api.get<OfferStockPoolsListOut>("/offer-stock-pools", {
    params: { tenant_id: tenantId },
  });
  return data.items ?? [];
}

export async function createOfferStockPool(params: {
  tenantId: number;
  name: string;
  warehouseIds: number[];
  isDefault?: boolean;
}): Promise<OfferStockPoolRead> {
  const { data } = await api.post<OfferStockPoolRead>(
    "/offer-stock-pools",
    {
      name: params.name,
      warehouse_ids: params.warehouseIds,
      is_default: params.isDefault ?? false,
    },
    { params: { tenant_id: params.tenantId } },
  );
  return data;
}

export async function patchOfferStockPool(params: {
  tenantId: number;
  poolId: number;
  body: {
    name?: string;
    warehouse_ids?: number[];
    is_default?: boolean;
  };
}): Promise<OfferStockPoolRead> {
  const { data } = await api.patch<OfferStockPoolRead>(
    `/offer-stock-pools/${params.poolId}`,
    params.body,
    { params: { tenant_id: params.tenantId } },
  );
  return data;
}
