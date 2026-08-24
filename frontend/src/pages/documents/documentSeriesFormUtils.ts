import type { CompanyProfileDto } from "../../api/companyProfileApi";
import type { DocumentSeriesDto, DocumentSeriesWritePayload } from "../../api/documentSeriesApi";

export const DOCUMENT_SERIES_SUBTYPE_TO_KIND: Record<string, string> = {
  INVOICE: "invoice",
  RECEIPT: "receipt",
  CORRECTION: "correction",
  WZ: "wz",
  PZ: "pz",
  PW: "pw",
  RW: "rw",
  MM: "mm",
  Z_PZ: "pz",
};

function trimProfileField(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

/** Zgodnie z {@link CompanyProfileDto} (Ustawienia → Firma) → pola `company_*` serii dokumentów. */
export function companyProfileToSeriesCompanyBlock(p: CompanyProfileDto): Pick<
  DocumentSeriesWritePayload,
  | "company_name"
  | "company_street"
  | "company_house_number"
  | "company_apartment_number"
  | "company_address"
  | "company_city"
  | "company_zip"
  | "company_country"
  | "company_nip"
  | "company_regon"
  | "company_bank"
  | "company_iban"
  | "company_bic"
  | "company_email"
> {
  return {
    company_name: trimProfileField(p.company_name),
    company_street: trimProfileField(p.street),
    company_house_number: trimProfileField(p.building_number),
    company_apartment_number: trimProfileField(p.apartment_number),
    company_address: trimProfileField(p.address_extra_line),
    company_city: trimProfileField(p.city),
    company_zip: trimProfileField(p.postal_code),
    company_country: trimProfileField(p.country),
    company_nip: trimProfileField(p.nip),
    company_regon: trimProfileField(p.regon),
    company_bank: trimProfileField(p.bank_name),
    company_iban: trimProfileField(p.iban),
    company_bic: trimProfileField(p.bic_swift),
    company_email: trimProfileField(p.document_email),
  };
}

export function documentSeriesDtoToWrite(d: DocumentSeriesDto): DocumentSeriesWritePayload {
  return {
    name: d.name,
    prefix: d.prefix,
    suffix: d.suffix,
    color: d.color,
    type: d.type,
    subtype: d.subtype,
    correction_series_id: d.correction_series_id,
    warehouse_document_series_id: d.warehouse_document_series_id ?? null,
    print_template: d.print_template,
    print_template_id: d.print_template_id ?? null,
    document_template_version_id: d.document_template_version_id ?? null,
    document_template_variant_code: d.document_template_variant_code ?? null,
    email_notification_enabled: d.email_notification_enabled,
    delete_mode: d.delete_mode,
    vat_source: d.vat_source ?? "FROM_ORDER",
    vat_calc_shipping: d.vat_calc_shipping ?? "DEFAULT",
    vat_calc_payment: d.vat_calc_payment ?? "DEFAULT",
    vat_rate_percent: d.vat_rate_percent ?? null,
    sale_date_source: d.sale_date_source,
    count_shipping_cost_always: d.count_shipping_cost_always,
    shipping_cost_name: d.shipping_cost_name,
    payment_term_default: d.payment_term_default,
    currency_source: d.currency_source,
    auto_currency_conversion: d.auto_currency_conversion,
    additional_fields_template: d.additional_fields_template,
    disable_customer_validation: d.disable_customer_validation,
    allow_empty_customer: d.allow_empty_customer,
    warehouse_effect: d.warehouse_effect,
    status_on_create_id: d.status_on_create_id,
    status_on_delete_id: d.status_on_delete_id,
    status_on_error_id: d.status_on_error_id,
    status_on_update_id: d.status_on_update_id,
    numbering_start: d.numbering_start,
    numbering_format: d.numbering_format,
    reset_each_period: d.reset_each_period,
    code: d.code ?? "",
    padding_length: d.padding_length ?? 6,
    yearly_reset: d.yearly_reset ?? false,
    monthly_reset: d.monthly_reset ?? false,
    is_default: d.is_default ?? false,
    is_active: d.is_active ?? true,
    notes: d.notes,
    collective_return_receipt: d.collective_return_receipt ?? false,
    company_name: d.company_name,
    company_street: d.company_street ?? null,
    company_house_number: d.company_house_number ?? null,
    company_apartment_number: d.company_apartment_number ?? null,
    company_address: d.company_address,
    company_city: d.company_city,
    company_zip: d.company_zip,
    company_country: d.company_country,
    company_nip: d.company_nip,
    company_regon: d.company_regon ?? null,
    company_bank: d.company_bank,
    company_iban: d.company_iban,
    company_bic: d.company_bic,
    company_email: d.company_email,
  };
}

export function cloneDocumentSeriesWrite(d: DocumentSeriesWritePayload): DocumentSeriesWritePayload {
  return { ...d };
}
