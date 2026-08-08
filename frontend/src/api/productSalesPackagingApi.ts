import api from "./axios";

export type ProductSalesPackagingDto = {
  id: string;
  product_id: number;
  name: string;
  level: string;
  ppwr_format?: string | null;
  material_category?: string | null;
  mass_g?: number | null;
  recyclable_pct?: number | null;
  recycled_content_pct?: number | null;
  is_reusable?: boolean | null;
  ppwr_status: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ProductSalesPackagingWrite = {
  name: string;
  level?: string;
  ppwr_format?: string | null;
  material_category?: string | null;
  mass_g?: number | null;
  recyclable_pct?: number | null;
  recycled_content_pct?: number | null;
  is_reusable?: boolean | null;
  ppwr_status?: string | null;
  is_active?: boolean;
  sort_order?: number;
};

export async function listProductSalesPackaging(
  productId: number,
  tenantId: number,
): Promise<ProductSalesPackagingDto[]> {
  const res = await api.get<ProductSalesPackagingDto[]>(`/products/${productId}/sales-packaging`, {
    params: { tenant_id: tenantId },
  });
  return Array.isArray(res.data) ? res.data : [];
}

export async function createProductSalesPackaging(
  productId: number,
  tenantId: number,
  body: ProductSalesPackagingWrite,
): Promise<ProductSalesPackagingDto> {
  const res = await api.post<ProductSalesPackagingDto>(`/products/${productId}/sales-packaging`, body, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function updateProductSalesPackaging(
  productId: number,
  packagingId: string,
  tenantId: number,
  body: Partial<ProductSalesPackagingWrite>,
): Promise<ProductSalesPackagingDto> {
  const res = await api.put<ProductSalesPackagingDto>(
    `/products/${productId}/sales-packaging/${packagingId}`,
    body,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function deleteProductSalesPackaging(
  productId: number,
  packagingId: string,
  tenantId: number,
): Promise<void> {
  await api.delete(`/products/${productId}/sales-packaging/${packagingId}`, {
    params: { tenant_id: tenantId },
  });
}
