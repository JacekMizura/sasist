/** Canonical request bodies for POST /direct-sales/session/{id}/add-product */

export type AddDirectSalesProductRequest = {
  product_id: number;
  quantity: number;
  source_location_id?: number | null;
};

export type AddDirectSalesProductParams = {
  tenantId: number;
  sessionId: number;
  productId: number;
  quantity?: number;
  sourceLocationId?: number | null;
};
