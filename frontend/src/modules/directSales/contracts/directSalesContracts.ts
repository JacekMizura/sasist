/** Single source of truth — operational direct-sales mutation request bodies (snake_case). */

export type AddDirectSalesProductRequest = {
  product_id: number;
  quantity: number;
};

export type SetDirectSalesCustomerRequest = {
  customer_id: number;
};

export type AddDirectSalesProductParams = {
  tenantId: number;
  sessionId: number;
  productId: number;
  quantity?: number;
  /** Applied via line patch after add — not sent on add-product body. */
  sourceLocationId?: number | null;
};

export type SetDirectSalesCustomerParams = {
  tenantId: number;
  sessionId: number;
  customerId: number;
};

export type ClearDirectSalesCustomerParams = {
  tenantId: number;
  sessionId: number;
};
