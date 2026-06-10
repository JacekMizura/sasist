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
  source: string | null;
  warning: string | null;
  error: string | null;
};

export async function postGusLookup(nip: string, forceRefresh = false): Promise<GusLookupResult> {
  const { data } = await api.post<GusLookupResult>("clients/gus-lookup", {
    nip,
    force_refresh: forceRefresh,
  });
  return data;
}
