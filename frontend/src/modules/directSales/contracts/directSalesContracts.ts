/** Single source of truth — operational direct-sales mutation request bodies (snake_case). */

import type { DirectSalesScope } from "../api/directSalesQueryParams";

export type { DirectSalesScope } from "../api/directSalesQueryParams";

export type AddDirectSalesProductRequest = {
  product_id: number;
  quantity: number;
  offer_id?: number | null;
};

export type SetDirectSalesCustomerRequest = {
  customer_id: number;
};

export type AddDirectSalesProductParams = DirectSalesScope & {
  sessionId: number;
  productId: number;
  quantity?: number;
  offerId?: number | null;
  /** Applied via line patch after add — not sent on add-product body. */
  sourceLocationId?: number | null;
};

export type SetDirectSalesCustomerParams = DirectSalesScope & {
  sessionId: number;
  customerId: number;
};

export type ClearDirectSalesCustomerParams = DirectSalesScope & {
  sessionId: number;
};
