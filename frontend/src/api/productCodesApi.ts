import api from "./axios";
import { extractApiErrorMessage } from "./apiErrorMessage";

export type ProductCodeKind = "sku" | "catalog";

export type ProductCodeResult = {
  kind: ProductCodeKind | string;
  category_id: number;
  code: string;
  template: string;
  sequence_key: string;
  sequence_n: number;
  value: string;
  allocated: boolean;
};

export type ProductCodeApiError = {
  message: string;
  code?: string;
};

function parseCodeError(e: unknown): ProductCodeApiError {
  if (e && typeof e === "object" && "response" in e) {
    const data = (e as { response?: { data?: { detail?: unknown } } }).response?.data;
    const detail = data?.detail;
    if (detail && typeof detail === "object" && detail !== null && "message" in detail) {
      const d = detail as { message?: string; code?: string };
      return { message: d.message || extractApiErrorMessage(e), code: d.code };
    }
  }
  return { message: extractApiErrorMessage(e) };
}

export async function previewProductCode(params: {
  tenantId: number;
  kind: ProductCodeKind;
  categoryId?: number | null;
  productId?: number | null;
}): Promise<ProductCodeResult> {
  try {
    const { data } = await api.post<ProductCodeResult>(
      "/product-codes/preview",
      {
        kind: params.kind,
        category_id: params.categoryId ?? undefined,
        product_id: params.productId ?? undefined,
      },
      { params: { tenant_id: params.tenantId } },
    );
    return data;
  } catch (e) {
    throw Object.assign(new Error(parseCodeError(e).message), { productCodeError: parseCodeError(e) });
  }
}

export async function allocateProductCode(params: {
  tenantId: number;
  kind: ProductCodeKind;
  categoryId?: number | null;
  productId?: number | null;
}): Promise<ProductCodeResult> {
  try {
    const { data } = await api.post<ProductCodeResult>(
      "/product-codes/allocate",
      {
        kind: params.kind,
        category_id: params.categoryId ?? undefined,
        product_id: params.productId ?? undefined,
      },
      { params: { tenant_id: params.tenantId } },
    );
    return data;
  } catch (e) {
    const err = parseCodeError(e);
    throw Object.assign(new Error(err.message), { productCodeError: err });
  }
}

export function getProductCodeError(e: unknown): ProductCodeApiError | null {
  if (e && typeof e === "object" && "productCodeError" in e) {
    return (e as { productCodeError: ProductCodeApiError }).productCodeError;
  }
  return null;
}
