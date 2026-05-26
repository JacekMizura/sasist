import api from "./axios";

export type WmsProductViewLocationApi = {
  location_id: number;
  code: string;
  quantity: number;
  badge: string;
  location_type: string | null;
};

export type WmsProductViewLogisticsApi = {
  weight_kg: number | null;
  volume_dm3: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  unit: string | null;
};

export type WmsProductViewPackageApi = {
  carton_ean: string | null;
  units_per_carton: number | null;
  carton_weight_kg: number | null;
  carton_volume_dm3: number | null;
  carton_length_cm: number | null;
  carton_width_cm: number | null;
  carton_height_cm: number | null;
};

export type WmsProductViewResponseApi = {
  product_id: number;
  name: string;
  ean: string | null;
  sku: string | null;
  image: string | null;
  total_stock: number;
  locations: WmsProductViewLocationApi[];
  logistics: WmsProductViewLogisticsApi;
  package: WmsProductViewPackageApi;
};

export async function getWmsProductView(
  tenantId: number,
  warehouseId: number,
  productId: number,
): Promise<WmsProductViewResponseApi> {
  const res = await api.get<WmsProductViewResponseApi>(`/wms/products/${productId}/view`, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}
