import api from "./axios";

export type GusLookupResult = {
  ok: boolean;
  found: boolean;
  gus_verified: boolean;
  from_cache: boolean;
  nip: string | null;
  company_name: string | null;
  regon: string | null;
  street: string | null;
  house_number: string | null;
  apartment_number: string | null;
  postal_code: string | null;
  city: string | null;
  voivodeship: string | null;
  business_status: string | null;
  activity_start_date: string | null;
  entity_type: string | null;
  pkd: string | null;
  vat_active: boolean | null;
  vat_ue: boolean | null;
  vat_status: string | null;
  vat_status_source: string | null;
  vat_ue_source: string | null;
  source: string | null;
  source_label: string | null;
  fetched_at: string | null;
  fetched_label: string | null;
  warning: string | null;
  error: string | null;
  error_code: string | null;
};

export async function postCustomerGusLookup(
  nip: string,
  tenantId: number,
  forceRefresh = false,
): Promise<GusLookupResult> {
  const { data } = await api.post<GusLookupResult>("customers/gus-lookup", {
    nip,
    tenant_id: tenantId,
    force_refresh: forceRefresh,
  });
  return data;
}
