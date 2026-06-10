import api from "./axios";

export type OrderCustomerDraft = {
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  company_name?: string | null;
  nip?: string | null;
  country_code: string;
  default_document_type: string;
  addresses: Record<string, unknown>[];
};

export type CustomerDuplicateCandidate = {
  id: number;
  display_name: string;
  email?: string | null;
  phone?: string | null;
  nip?: string | null;
  match_reasons: string[];
};

export type OrderCustomerLinkPreview = {
  order_id: number;
  customer_id?: number | null;
  has_customer_data: boolean;
  draft: OrderCustomerDraft;
  duplicates: CustomerDuplicateCandidate[];
};

export type OrderCustomerLinkResult = {
  order_id: number;
  customer_id: number;
  display_name: string;
  duplicates_skipped?: number;
};

export async function previewOrderCustomerLink(
  tenantId: number,
  orderId: number,
): Promise<OrderCustomerLinkPreview> {
  const { data } = await api.get<OrderCustomerLinkPreview>("customers/order-link/preview", {
    params: { tenant_id: tenantId, order_id: orderId },
  });
  return data;
}

export async function createCustomerFromOrder(
  tenantId: number,
  orderId: number,
  forceDuplicate = false,
): Promise<OrderCustomerLinkResult> {
  const { data } = await api.post<OrderCustomerLinkResult>("customers/order-link/create", {
    tenant_id: tenantId,
    order_id: orderId,
    force_duplicate: forceDuplicate,
  });
  return data;
}

export async function linkOrderToCustomer(
  tenantId: number,
  orderId: number,
  customerId: number,
): Promise<OrderCustomerLinkResult> {
  const { data } = await api.post<OrderCustomerLinkResult>("customers/order-link/link", {
    tenant_id: tenantId,
    order_id: orderId,
    customer_id: customerId,
  });
  return data;
}
