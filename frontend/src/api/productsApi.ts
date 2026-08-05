import api from "./axios";
import type { ProductListRow } from "../types/productListRow";

export type ProductDuplicateResult = ProductListRow & {
  id: number;
  tenant_id?: number;
  name?: string;
};

export async function duplicateProduct(
  productId: number,
  tenantId: number,
): Promise<ProductDuplicateResult> {
  const res = await api.post<ProductDuplicateResult>(
    `/products/${productId}/duplicate`,
    {},
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export type ConvertProductToBundleResult = {
  id: number;
  tenant_id: number;
  name: string;
  sku?: string | null;
  ean?: string | null;
};

export async function convertProductToBundle(
  productId: number,
  tenantId: number,
): Promise<ConvertProductToBundleResult> {
  const res = await api.post<ConvertProductToBundleResult>(
    `/products/${productId}/convert-to-bundle`,
    {},
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}
