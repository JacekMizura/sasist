import type { AddDirectSalesProductParams, AddDirectSalesProductRequest } from "./contracts";

export class DirectSalesAddProductPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectSalesAddProductPayloadError";
  }
}

/**
 * Maps UI params → FastAPI `DirectSaleAddProductBody`.
 * Never sends sku/ean/catalog_number — only canonical product_id + quantity.
 */
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

  const body: AddDirectSalesProductRequest = {
    product_id: Math.trunc(productId),
    quantity,
  };

  const loc = params.sourceLocationId;
  if (loc != null && loc !== undefined) {
    const locationId = Number(loc);
    if (Number.isFinite(locationId) && locationId > 0) {
      body.source_location_id = Math.trunc(locationId);
    }
  }

  return body;
}
