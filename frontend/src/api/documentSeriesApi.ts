import api from "./axios";

export type DocumentSeriesType = "SALE" | "WAREHOUSE" | "CORRECTION";
export type DocumentSeriesSubtype =
  | "INVOICE"
  | "RECEIPT"
  | "WZ"
  | "PZ"
  | "MM"
  | "RW"
  | "PW"
  | "RESERVATION"
  | "Z_PZ"
  | "CORRECTION";
export type DeleteMode = "ALWAYS_DELETE" | "ASK";
export type VatSource = "FROM_ORDER" | "FROM_LINES" | "MANUAL" | "FIXED";
export type VatCalcLineMode = "DEFAULT" | "FROM_ORDER" | "FROM_LINES" | "EXCLUDE" | "MANUAL";
export type SaleDateSource = "ORDER_DATE" | "DOCUMENT_DATE" | "DELIVERY_DATE" | "MANUAL";
export type CurrencySource = "ORDER" | "SERIES" | "MANUAL";

export type OrderUiStatusMini = { id: number; name: string; main_group: string };

export type DocumentSeriesDto = {
  id: string;
  tenant_id: number;
  warehouse_id: number;
  name: string;
  prefix: string;
  suffix: string;
  color: string;
  type: DocumentSeriesType;
  subtype: DocumentSeriesSubtype;
  correction_series_id: string | null;
  /** Linked WZ series for SALE documents (Seria dokumentu magazynowego). */
  warehouse_document_series_id: string | null;
  print_template: string;
  print_template_id: number | null;
  email_notification_enabled: boolean;
  delete_mode: DeleteMode;
  vat_source: VatSource | null;
  vat_calc_shipping: VatCalcLineMode;
  vat_calc_payment: VatCalcLineMode;
  /** Domyślna stawka VAT w procentach — opcjonalnie, 0–100. */
  vat_rate_percent?: number | null;
  sale_date_source: SaleDateSource;
  count_shipping_cost_always: boolean;
  shipping_cost_name: string;
  payment_term_default: string;
  currency_source: CurrencySource;
  auto_currency_conversion: boolean;
  additional_fields_template: string | null;
  disable_customer_validation: boolean;
  allow_empty_customer: boolean;
  warehouse_effect: boolean;
  status_on_create_id: number | null;
  status_on_delete_id: number | null;
  status_on_error_id: number | null;
  status_on_update_id: number | null;
  numbering_start: number;
  numbering_format: string;
  reset_each_period: boolean;
  code: string;
  padding_length: number;
  yearly_reset: boolean;
  monthly_reset: boolean;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
  /** Z-PZ: zbiorczy dokument zwrotów (jeden Z-PZ / dzień). */
  collective_return_receipt?: boolean;
  company_name: string | null;
  company_street: string | null;
  company_house_number: string | null;
  company_apartment_number: string | null;
  company_address: string | null;
  company_city: string | null;
  company_zip: string | null;
  company_country: string | null;
  company_nip: string | null;
  company_regon: string | null;
  company_bank: string | null;
  company_iban: string | null;
  company_bic: string | null;
  company_email: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  status_on_create?: OrderUiStatusMini | null;
  status_on_delete?: OrderUiStatusMini | null;
  status_on_error?: OrderUiStatusMini | null;
  status_on_update?: OrderUiStatusMini | null;
};

export type DocumentSeriesWritePayload = Omit<
  DocumentSeriesDto,
  | "id"
  | "tenant_id"
  | "warehouse_id"
  | "created_at"
  | "updated_at"
  | "status_on_create"
  | "status_on_delete"
  | "status_on_error"
  | "status_on_update"
>;

/** Defaults for a new series (create form + quick-create modal). */
export function createDefaultDocumentSeriesWrite(): DocumentSeriesWritePayload {
  return {
    name: "",
    prefix: "",
    suffix: "",
    color: "#64748b",
    type: "SALE",
    subtype: "INVOICE",
    correction_series_id: null,
    warehouse_document_series_id: null,
    print_template: "",
    print_template_id: null,
    email_notification_enabled: false,
    delete_mode: "ASK",
    vat_source: "FROM_ORDER",
    vat_calc_shipping: "DEFAULT",
    vat_calc_payment: "DEFAULT",
    vat_rate_percent: null,
    sale_date_source: "ORDER_DATE",
    count_shipping_cost_always: false,
    shipping_cost_name: "Koszt wysyłki",
    payment_term_default: "",
    currency_source: "ORDER",
    auto_currency_conversion: false,
    additional_fields_template: null,
    disable_customer_validation: false,
    allow_empty_customer: false,
    warehouse_effect: false,
    status_on_create_id: null,
    status_on_delete_id: null,
    status_on_error_id: null,
    status_on_update_id: null,
    numbering_start: 1,
    numbering_format: "{PREFIX}{NUMBER}",
    reset_each_period: false,
    code: "",
    padding_length: 6,
    yearly_reset: false,
    monthly_reset: false,
    is_default: false,
    is_active: true,
    notes: null,
    collective_return_receipt: false,
    company_name: null,
    company_street: null,
    company_house_number: null,
    company_apartment_number: null,
    company_address: null,
    company_city: null,
    company_zip: null,
    company_country: null,
    company_nip: null,
    company_regon: null,
    company_bank: null,
    company_iban: null,
    company_bic: null,
    company_email: null,
  };
}

export function subtypesForDocumentSeriesType(t: DocumentSeriesType): DocumentSeriesSubtype[] {
  if (t === "SALE") return ["INVOICE", "RECEIPT"];
  if (t === "WAREHOUSE") return ["WZ", "PZ", "Z_PZ", "MM", "RW", "PW", "RESERVATION"];
  return ["CORRECTION"];
}

/** SALE + podtyp INVOICE | RECEIPT | CORRECTION (jedna lista dla pakowania i spójnych filtrów). */
export const SALE_PACKING_SUBTYPES = ["INVOICE", "RECEIPT", "CORRECTION"] as const;

export function filterSaleSeriesForPacking(series: DocumentSeriesDto[]): DocumentSeriesDto[] {
  const allow = new Set<string>([...SALE_PACKING_SUBTYPES]);
  return series.filter((s) => s.type === "SALE" && allow.has(String(s.subtype || "").toUpperCase()));
}

/** Wszystkie serii typu SALE (np. panel zamówienia — faktura vs paragon). */
export function filterSaleSeriesAll(series: DocumentSeriesDto[]): DocumentSeriesDto[] {
  return series.filter((s) => s.type === "SALE");
}

const baseParams = (tenantId: number, warehouseId: number) => ({
  tenant_id: tenantId,
  warehouse_id: warehouseId,
});

function assertTenantWarehouse(tenantId: number, warehouseId: number, fn: string): void {
  if (!Number.isFinite(tenantId) || tenantId < 1) {
    throw new Error(`${fn}: tenant_id must be a finite number >= 1 (got ${String(tenantId)})`);
  }
  if (!Number.isFinite(warehouseId) || warehouseId < 1) {
    throw new Error(`${fn}: warehouse_id must be a finite number >= 1 (got ${String(warehouseId)})`);
  }
}

export type OperationalDocumentSeriesDto = {
  series_id: string;
  series_type: DocumentSeriesType;
  subtype: DocumentSeriesSubtype;
  operational_code: string;
  prefix: string;
  label: string;
  warehouse_effect: boolean;
  route_segment: string | null;
  list_path: string | null;
  stock_document_type: string | null;
  is_default: boolean;
  is_active: boolean;
  numbering_format: string;
};

export type OperationalDocumentCatalogDto = {
  tenant_id: number;
  warehouse_id: number;
  required_count: number;
  configured_count: number;
  missing_required_subtypes: string[];
  bootstrap_complete: boolean;
  items: OperationalDocumentSeriesDto[];
};

/** Series-driven operational document types (UI tabs, WMS gates). */
export async function fetchOperationalDocumentCatalog(
  tenantId: number,
  warehouseId: number,
): Promise<OperationalDocumentCatalogDto> {
  assertTenantWarehouse(tenantId, warehouseId, "fetchOperationalDocumentCatalog");
  const res = await api.get<OperationalDocumentCatalogDto>("document-series/operational-catalog", {
    params: baseParams(tenantId, warehouseId),
  });
  return res.data;
}

/** Zawsze pełna lista dla tenant+magazyn (bez ?type=). Filtrowanie typu/podtypu tylko po stronie klienta. */
export async function listDocumentSeries(tenantId: number, warehouseId: number): Promise<DocumentSeriesDto[]> {
  assertTenantWarehouse(tenantId, warehouseId, "listDocumentSeries");
  const params = { ...baseParams(tenantId, warehouseId) };
  if (import.meta.env.DEV) console.log("FETCH PARAMS document-series/", params);
  const res = await api.get<DocumentSeriesDto[]>("document-series", {
    params,
    headers: {
      "Cache-Control": "no-cache, no-store",
      Pragma: "no-cache",
    },
  });
  const data = Array.isArray(res.data) ? res.data : [];
  if (import.meta.env.DEV) console.log("ALL SERIES", data);
  return data;
}

export async function getDocumentSeries(
  id: string,
  tenantId: number,
  warehouseId: number,
): Promise<DocumentSeriesDto> {
  assertTenantWarehouse(tenantId, warehouseId, "getDocumentSeries");
  const res = await api.get<DocumentSeriesDto>(`document-series/${encodeURIComponent(id)}`, {
    params: baseParams(tenantId, warehouseId),
  });
  return res.data;
}

export async function createDocumentSeries(
  tenantId: number,
  warehouseId: number,
  body: DocumentSeriesWritePayload,
): Promise<DocumentSeriesDto> {
  assertTenantWarehouse(tenantId, warehouseId, "createDocumentSeries");
  /** Pola tenant/warehouse na końcu — nadpisują ewentualne klucze z `body` (np. po skopiowaniu z DTO). */
  const payload = {
    ...body,
    tenant_id: tenantId,
    warehouse_id: warehouseId,
  };
  if (import.meta.env.DEV) console.log("CREATE PAYLOAD", payload);
  const res = await api.post<DocumentSeriesDto>("document-series", payload);
  return res.data;
}

export async function updateDocumentSeries(
  id: string,
  tenantId: number,
  warehouseId: number,
  body: DocumentSeriesWritePayload,
): Promise<DocumentSeriesDto> {
  assertTenantWarehouse(tenantId, warehouseId, "updateDocumentSeries");
  const res = await api.put<DocumentSeriesDto>(`document-series/${encodeURIComponent(id)}`, body, {
    params: baseParams(tenantId, warehouseId),
  });
  return res.data;
}

export async function deleteDocumentSeries(
  id: string,
  tenantId: number,
  warehouseId: number,
): Promise<void> {
  assertTenantWarehouse(tenantId, warehouseId, "deleteDocumentSeries");
  await api.delete(`document-series/${encodeURIComponent(id)}`, {
    params: baseParams(tenantId, warehouseId),
  });
}

export async function bulkDeleteDocumentSeries(
  tenantId: number,
  warehouseId: number,
  ids: string[],
): Promise<{ deleted: number }> {
  assertTenantWarehouse(tenantId, warehouseId, "bulkDeleteDocumentSeries");
  const res = await api.post<{ deleted: number }>("document-series/bulk-delete", {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    ids,
  });
  return res.data;
}
