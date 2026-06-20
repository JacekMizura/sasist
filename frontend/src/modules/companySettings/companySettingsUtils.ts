import type { CompanyProfileDto, CompanyProfileUpdatePayload } from "../../api/companyProfileApi";
import { ASSIGNMENT_ROLE_LABELS } from "../../services/warehouseService";

export const COMPANY_TENANT_ID = 1;

export type CompanyFormState = {
  company_name: string;
  street: string;
  building_number: string;
  apartment_number: string;
  postal_code: string;
  city: string;
  country: string;
  nip: string;
  regon: string;
  address_extra_line: string;
  bank_name: string;
  iban: string;
  bic_swift: string;
  document_email: string;
  company_phone: string;
  website_url: string;
};

export function dtoToForm(d: CompanyProfileDto): CompanyFormState {
  const s = (v: string | null | undefined) => (v ?? "").trim();
  return {
    company_name: s(d.company_name),
    street: s(d.street),
    building_number: s(d.building_number),
    apartment_number: s(d.apartment_number),
    postal_code: s(d.postal_code),
    city: s(d.city),
    country: s(d.country),
    nip: s(d.nip),
    regon: s(d.regon),
    address_extra_line: s(d.address_extra_line),
    bank_name: s(d.bank_name),
    iban: s(d.iban),
    bic_swift: s(d.bic_swift),
    document_email: s(d.document_email),
    company_phone: s(d.company_phone),
    website_url: s(d.website_url),
  };
}

function trimOrNull(v: string): string | null {
  const t = v.trim();
  return t.length ? t : null;
}

export function formToPayload(f: CompanyFormState): CompanyProfileUpdatePayload {
  return {
    company_name: trimOrNull(f.company_name),
    street: trimOrNull(f.street),
    building_number: trimOrNull(f.building_number),
    apartment_number: trimOrNull(f.apartment_number),
    postal_code: trimOrNull(f.postal_code),
    city: trimOrNull(f.city),
    country: trimOrNull(f.country),
    nip: trimOrNull(f.nip),
    regon: trimOrNull(f.regon),
    address_extra_line: trimOrNull(f.address_extra_line),
    bank_name: trimOrNull(f.bank_name),
    iban: trimOrNull(f.iban),
    bic_swift: trimOrNull(f.bic_swift),
    document_email: trimOrNull(f.document_email),
    company_phone: trimOrNull(f.company_phone),
    website_url: trimOrNull(f.website_url),
  };
}

export function fmtDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function warehouseProfileLabel(requiresPutaway: boolean | undefined): string {
  return requiresPutaway !== false ? "WMS (DOCK + putaway)" : "Magazyn prosty (STOCK)";
}

export function warehouseTypeLabel(t: string | null | undefined): string {
  if (!t) return "Własny";
  if (t === "own") return "Własny";
  if (t === "fulfilment" || t === "fulfillment") return "Fulfillment";
  return t;
}

export function roleLabel(role: string): string {
  return ASSIGNMENT_ROLE_LABELS[role] ?? role;
}

export function isAllowedLogoFile(f: File): boolean {
  const t = f.type.toLowerCase();
  return t === "image/png" || t === "image/jpeg" || t === "image/svg+xml";
}

export const LOGO_MAX_BYTES = 6 * 1024 * 1024;
