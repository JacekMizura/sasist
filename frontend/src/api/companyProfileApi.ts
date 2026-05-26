import api from "./axios";

export type CompanyProfileDto = {
  tenant_id: number;
  company_name: string | null;
  street: string | null;
  building_number: string | null;
  apartment_number: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  nip: string | null;
  regon: string | null;
  address_extra_line: string | null;
  bank_name: string | null;
  iban: string | null;
  bic_swift: string | null;
  document_email: string | null;
  company_phone: string | null;
  website_url: string | null;
  logo_url: string | null;
};

export type CompanyProfileUpdatePayload = {
  company_name?: string | null;
  street?: string | null;
  building_number?: string | null;
  apartment_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  nip?: string | null;
  regon?: string | null;
  address_extra_line?: string | null;
  bank_name?: string | null;
  iban?: string | null;
  bic_swift?: string | null;
  document_email?: string | null;
  company_phone?: string | null;
  website_url?: string | null;
};

const tenantParams = (tenantId: number) => ({ tenant_id: tenantId });

export async function fetchCompanyProfile(tenantId: number): Promise<CompanyProfileDto> {
  const res = await api.get<CompanyProfileDto>("company-profile", { params: tenantParams(tenantId) });
  return res.data;
}

export async function putCompanyProfile(
  tenantId: number,
  body: CompanyProfileUpdatePayload
): Promise<CompanyProfileDto> {
  const res = await api.put<CompanyProfileDto>("company-profile", body, { params: tenantParams(tenantId) });
  return res.data;
}

export async function postCompanyLogo(tenantId: number, file: File): Promise<CompanyProfileDto> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post<CompanyProfileDto>("company-profile/logo", fd, {
    params: tenantParams(tenantId),
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function deleteCompanyLogo(tenantId: number): Promise<CompanyProfileDto> {
  const res = await api.delete<CompanyProfileDto>("company-profile/logo", { params: tenantParams(tenantId) });
  return res.data;
}
