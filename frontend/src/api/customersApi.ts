import type {
  CustomerFlags,
  CustomerStatus,
  CustomerSummary,
  CustomerType,
  SalesChannel,
} from "../modules/customers/customerProfile";
import api from "./axios";
import type { EntityBulkDeleteResult } from "../types/entityBulkDelete";

export type CustomerAddressDto = {
  id?: number;
  customer_id?: number;
  first_name: string;
  last_name: string;
  company_name?: string | null;
  street: string;
  house_number: string;
  apartment_number?: string | null;
  postal_code: string;
  city: string;
  country_code: string;
  is_default: boolean;
};

export type CustomerProductDiscountDto = {
  id?: number;
  customer_id?: number;
  product_id: number;
  discount_percent: number;
  product_name?: string | null;
  product_sku?: string | null;
};

export type CustomerListRow = {
  id: number;
  tenant_id: number;
  display_name: string;
  email?: string | null;
  phone?: string | null;
  nip?: string | null;
  country_code: string;
  customer_type?: CustomerType;
  customer_status?: CustomerStatus;
  sales_channel?: SalesChannel;
  flags?: CustomerFlags;
  order_count?: number;
  total_gross?: number;
  /** Opcjonalne — gdy backend rozszerzy listę. */
  created_at?: string | null;
  last_order_at?: string | null;
  total_net?: number | null;
  returns_count?: number | null;
  global_discount_percent?: number | null;
  /** Opcjonalne — gdy backend rozszerzy listę. */
  company_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export type CustomerDetail = {
  id: number;
  tenant_id: number;
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  company_name?: string | null;
  nip?: string | null;
  country_code: string;
  default_document_type: "RECEIPT" | "INVOICE";
  preferred_shipping_method_id?: string | null;
  preferred_payment_method?: string | null;
  global_discount_percent: number;
  customer_type?: CustomerType;
  customer_status?: CustomerStatus;
  sales_channel?: SalesChannel;
  flags?: CustomerFlags;
  credit_limit_gross?: number | null;
  payment_terms_days?: number | null;
  account_manager_user_id?: number | null;
  summary?: CustomerSummary | null;
  created_at?: string | null;
  updated_at?: string | null;
  addresses: CustomerAddressDto[];
  product_discounts: CustomerProductDiscountDto[];
};

export type CustomerCrmAction =
  | "mark_vip"
  | "unmark_vip"
  | "mark_debtor"
  | "unmark_debtor"
  | "block"
  | "unblock";

export type CustomerCreatePayload = {
  tenant_id: number;
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  company_name?: string | null;
  nip?: string | null;
  country_code: string;
  default_document_type: "RECEIPT" | "INVOICE";
  preferred_shipping_method_id?: string | null;
  preferred_payment_method?: string | null;
  global_discount_percent: number;
  customer_type?: CustomerType;
  sales_channel?: SalesChannel;
  flags?: CustomerFlags;
  credit_limit_gross?: number | null;
  payment_terms_days?: number | null;
  addresses: Omit<CustomerAddressDto, "id" | "customer_id">[];
  product_discounts: { product_id: number; discount_percent: number }[];
};

export type ListCustomersParams = {
  tenant_id: number;
  search?: string;
  country_code?: string;
  has_orders?: boolean;
  has_email?: boolean;
  has_phone?: boolean;
  created_from?: string;
  created_to?: string;
  customer_type?: CustomerType;
  sales_channel?: SalesChannel;
};

export async function listCustomers(params: ListCustomersParams): Promise<CustomerListRow[]> {
  const p: Record<string, string | number | boolean> = { tenant_id: params.tenant_id };
  const s = params.search?.trim();
  if (s) p.search = s;
  const cc = params.country_code?.trim().toUpperCase();
  if (cc) p.country_code = cc;
  if (params.has_orders === true || params.has_orders === false) p.has_orders = params.has_orders;
  if (params.has_email === true || params.has_email === false) p.has_email = params.has_email;
  if (params.has_phone === true || params.has_phone === false) p.has_phone = params.has_phone;
  if (params.created_from?.trim()) p.created_from = params.created_from.trim();
  if (params.created_to?.trim()) p.created_to = params.created_to.trim();
  if (params.customer_type) p.customer_type = params.customer_type;
  if (params.sales_channel) p.sales_channel = params.sales_channel;

  /** Must match backend `@router.get("")` — trailing slash triggers 307 → often `http://` Location on Railway. */
  const url = "customers";
  const res = await api.get<CustomerListRow[]>(url, { params: p });
  return Array.isArray(res.data) ? res.data : [];
}

export async function getCustomer(id: number, tenantId: number): Promise<CustomerDetail> {
  const res = await api.get<CustomerDetail>(`/customers/${id}`, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function createCustomer(body: CustomerCreatePayload): Promise<CustomerDetail> {
  const res = await api.post<CustomerDetail>("customers", body);
  return res.data;
}

export async function patchCustomer(
  id: number,
  tenantId: number,
  body: Partial<Omit<CustomerCreatePayload, "tenant_id">>,
): Promise<CustomerDetail> {
  const res = await api.patch<CustomerDetail>(`/customers/${id}`, body, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function postCustomerCrmAction(
  id: number,
  tenantId: number,
  action: CustomerCrmAction,
): Promise<CustomerDetail> {
  const res = await api.post<CustomerDetail>(
    `/customers/${id}/crm/actions`,
    { action },
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function deleteCustomer(id: number, tenantId: number): Promise<EntityBulkDeleteResult> {
  const res = await api.delete<EntityBulkDeleteResult>(`/customers/${id}`, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function postCustomersBulkDelete(body: {
  tenant_id: number;
  ids: number[];
}): Promise<EntityBulkDeleteResult> {
  const res = await api.post<EntityBulkDeleteResult>("/customers/bulk-delete", body);
  return res.data;
}
