import api from "./axios";

export type ProductSalesOfferRead = {
  id: number;
  product_id: number;
  stock_disposition: string;
  name: string;
  sale_price_net: number | null;
  effective_sale_price_net: number | null;
  uses_product_price: boolean;
  is_default: boolean;
  active: boolean;
  available_qty: number;
  stock_pool_id: number | null;
  stock_pool_name: string | null;
};

export type ProductSalesOffersListOut = {
  product_id: number;
  offers: ProductSalesOfferRead[];
};

export async function listProductSalesOffers(params: {
  tenantId: number;
  productId: number;
  warehouseId?: number | null;
}): Promise<ProductSalesOffersListOut> {
  const { data } = await api.get<ProductSalesOffersListOut>(
    `/products/${params.productId}/sales-offers`,
    {
      params: {
        tenant_id: params.tenantId,
        warehouse_id: params.warehouseId ?? undefined,
      },
    },
  );
  return data;
}

export async function createOutletSalesOffer(params: {
  tenantId: number;
  productId: number;
  warehouseId?: number | null;
}): Promise<ProductSalesOfferRead> {
  const { data } = await api.post<ProductSalesOfferRead>(
    `/products/${params.productId}/sales-offers/outlet`,
    {},
    {
      params: {
        tenant_id: params.tenantId,
        warehouse_id: params.warehouseId ?? undefined,
      },
    },
  );
  return data;
}

export async function patchProductSalesOffer(params: {
  tenantId: number;
  offerId: number;
  body: {
    name?: string;
    sale_price_net?: number | null;
    active?: boolean;
    stock_pool_id?: number | null;
  };
  warehouseId?: number | null;
}): Promise<ProductSalesOfferRead> {
  const { data } = await api.patch<ProductSalesOfferRead>(`/sales-offers/${params.offerId}`, params.body, {
    params: {
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId ?? undefined,
    },
  });
  return data;
}

export async function deleteProductSalesOffer(params: {
  tenantId: number;
  offerId: number;
}): Promise<void> {
  await api.delete(`/sales-offers/${params.offerId}`, {
    params: { tenant_id: params.tenantId },
  });
}

export function dispositionOfferLabel(code: string | null | undefined): string {
  const c = (code || "SALEABLE").toUpperCase();
  if (c === "SALEABLE") return "Standard";
  if (c === "OUTLET_B") return "Outlet B";
  return c;
}
