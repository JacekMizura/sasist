import type { AddDirectSalesProductParams, AddDirectSalesProductRequest } from "../contracts/directSalesContracts";

export class DirectSalesAddProductPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectSalesAddProductPayloadError";
  }
}

/** UI params → POST /add-product body. Never sends sku/ean/catalog_number. */
export function mapAddDirectSalesProductBody(params: AddDirectSalesProductParams): AddDirectSalesProductRequest {
  const productId = Number(params.productId);
  if (!Number.isFinite(productId) || productId < 1) {
    throw new DirectSalesAddProductPayloadError(`Nieprawidłowy product_id: ${String(params.productId)}`);
  }

  const rawQty = params.quantity ?? 1;
  const quantity = Number(rawQty);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new DirectSalesAddProductPayloadError(`Nieprawidłowa ilość: ${String(params.quantity)}`);
  }

  return {
    product_id: Math.trunc(productId),
    quantity: Math.max(1, Math.trunc(quantity)),
  };
}
