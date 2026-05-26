import api from "./axios";

export type SupplierRead = {
  id: number;
  tenant_id: number;
  name: string;
  company_name?: string | null;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  country?: string | null;
  city?: string | null;
  postal_code?: string | null;
  street?: string | null;
  address?: string | null;
  active: boolean;
  default_lead_time_days?: number | null;
  default_currency?: string | null;
  minimum_order_value?: number | null;
  minimum_order_qty?: number | null;
  free_shipping_threshold?: number | null;
  offers_free_shipping?: boolean;
  requires_moq?: boolean;
  notes?: string | null;
  delivery_count: number;
  is_incomplete?: boolean;
  /** From API when country is in catalog; null if legacy/unknown. */
  country_is_eu?: boolean | null;
};

export type SupplierCreatePayload = {
  tenant_id: number;
  name: string;
  company_name?: string | null;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  country?: string | null;
  city?: string | null;
  postal_code?: string | null;
  street?: string | null;
  address?: string | null;
  active?: boolean;
  default_lead_time_days?: number | null;
  default_currency?: string | null;
  minimum_order_value?: number | null;
  minimum_order_qty?: number | null;
  free_shipping_threshold?: number | null;
  offers_free_shipping?: boolean;
  requires_moq?: boolean;
  notes?: string | null;
};

export type SupplierUpdatePayload = Omit<SupplierCreatePayload, "tenant_id">;

export async function listSuppliers(
  tenantId: number,
  params?: { name?: string; status?: "all" | "active" | "inactive" },
): Promise<SupplierRead[]> {
  const res = await api.get<SupplierRead[]>("/suppliers/", {
    params: {
      tenant_id: tenantId,
      name: params?.name?.trim() || undefined,
      status: params?.status ?? "all",
    },
  });
  return res.data;
}

export async function getSupplier(tenantId: number, id: number): Promise<SupplierRead> {
  const res = await api.get<SupplierRead>(`/suppliers/${id}`, { params: { tenant_id: tenantId } });
  return res.data;
}

export async function createSupplier(payload: SupplierCreatePayload): Promise<SupplierRead> {
  const res = await api.post<SupplierRead>("/suppliers/", payload);
  return res.data;
}

export async function updateSupplier(tenantId: number, id: number, payload: SupplierUpdatePayload): Promise<SupplierRead> {
  const res = await api.put<SupplierRead>(`/suppliers/${id}`, payload, { params: { tenant_id: tenantId } });
  return res.data;
}

export type SupplierDeleteResult =
  | { deleted: true; delivery_count: number }
  | { deactivated: true; delivery_count: number; detail: string };

export async function deleteSupplier(tenantId: number, id: number): Promise<SupplierDeleteResult> {
  const res = await api.delete<SupplierDeleteResult>(`/suppliers/${id}`, { params: { tenant_id: tenantId } });
  return res.data;
}
