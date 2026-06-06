import type { SetDirectSalesCustomerRequest } from "../contracts/directSalesContracts";

export class DirectSalesSetCustomerPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectSalesSetCustomerPayloadError";
  }
}

/** UI customer id → POST /set-customer body. Never sends nested customer objects. */
export function mapSetDirectSalesCustomerBody(customerId: number): SetDirectSalesCustomerRequest {
  const id = Number(customerId);
  if (!Number.isFinite(id) || id < 1) {
    throw new DirectSalesSetCustomerPayloadError(`Nieprawidłowy customer_id: ${String(customerId)}`);
  }
  return { customer_id: Math.trunc(id) };
}
