import api from "./axios";

export type LocationStockRow = {
  location_id: number;
  code: string;
  type: string;
  operational_zone_type: string | null;
  available: number;
  on_hand: number;
  reserved: number;
  picking: number;
  sales_priority: number;
  picking_priority: number;
};

export type LocationStockSnapshot = {
  product_id: number;
  warehouse_id: number;
  tenant_id?: number;
  as_of?: string;
  revision?: string;
  summary: {
    available: number;
    reserved: number;
    picking: number;
  };
  locations: LocationStockRow[];
};

export async function fetchLocationStock(params: {
  tenantId: number;
  warehouseId: number;
  productId: number;
  availableOnly?: boolean;
  revision?: string | null;
}): Promise<LocationStockSnapshot> {
  const { data } = await api.get<LocationStockSnapshot>("location-stock", {
    params: {
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId,
      product_id: params.productId,
      available_only: params.availableOnly ?? false,
      ...(params.revision ? { if_revision_ne: params.revision } : {}),
    },
  });
  return data;
}
