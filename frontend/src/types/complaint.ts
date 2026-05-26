import { COMPLAINT_STATUS_STYLES } from "../constants/complaintStatusStyles";

export type { ComplaintStatusStyleCode } from "../constants/complaintStatusStyles";
export { COMPLAINT_STATUS_STYLES, complaintStatusSidebarFilterClass } from "../constants/complaintStatusStyles";

/** Pojedyncze wartości statusu reklamacji (źródło prawdy w bazie i API: `status`). */
export type ComplaintStatusCode =
  | "NOWE"
  | "OCZEKIWANIE_NA_PRODUKT"
  | "WERYFIKACJA"
  | "DECYZJA"
  | "ZAAKCEPTOWANA"
  | "ODRZUCONA";

/** @deprecated używaj ComplaintStatusCode */
export type ComplaintProcessStatus = ComplaintStatusCode;

export const COMPLAINT_STATUS_LABELS_PL: Record<ComplaintStatusCode, string> = {
  NOWE: "Nowa reklamacja",
  OCZEKIWANIE_NA_PRODUKT: "Oczekiwanie na produkt",
  WERYFIKACJA: "Weryfikacja",
  DECYZJA: "Decyzja",
  ZAAKCEPTOWANA: "Zaakceptowana",
  ODRZUCONA: "Odrzucona",
};

const STATUS_CODES: ComplaintStatusCode[] = [
  "NOWE",
  "OCZEKIWANIE_NA_PRODUKT",
  "WERYFIKACJA",
  "DECYZJA",
  "ZAAKCEPTOWANA",
  "ODRZUCONA",
];

export function normalizeComplaintStatus(raw: string | null | undefined): ComplaintStatusCode {
  const u = String(raw ?? "NOWE").trim().toUpperCase();
  if (u === "DECISION") return "DECYZJA";
  return STATUS_CODES.includes(u as ComplaintStatusCode) ? (u as ComplaintStatusCode) : "NOWE";
}

/** Klasy tła/tekstu/obramowania badge — zawsze z {@link COMPLAINT_STATUS_STYLES}. */
export function complaintStatusBadgeClass(status: ComplaintStatusCode): string {
  return COMPLAINT_STATUS_STYLES[status];
}

/** Wiersz listy: etykieta i klasa badge wyłącznie z pola `status` (dokładny etap, nie grupa filtra). */
export function complaintRowStatusPresentation(raw: string | null | undefined): { label: string; badgeClass: string } {
  let u = String(raw ?? "").trim().toUpperCase();
  if (u === "DECISION") u = "DECYZJA";
  if (STATUS_CODES.includes(u as ComplaintStatusCode)) {
    const code = u as ComplaintStatusCode;
    return { label: COMPLAINT_STATUS_LABELS_PL[code], badgeClass: complaintStatusBadgeClass(code) };
  }
  const trimmed = String(raw ?? "").trim();
  return {
    label: trimmed || "—",
    badgeClass: "border-gray-300 bg-gray-100 text-gray-700",
  };
}

/** @deprecated używaj COMPLAINT_STATUS_LABELS_PL */
export const COMPLAINT_PROCESS_LABELS_PL = COMPLAINT_STATUS_LABELS_PL;

/** @deprecated używaj normalizeComplaintStatus */
export const normalizeComplaintProcessStatus = normalizeComplaintStatus;

/** Etykiety filtra bocznego (1:1 z `complaint.status` w API). */
export const COMPLAINT_SIDEBAR_FILTER_LABELS_PL: Record<ComplaintStatusCode, string> = {
  NOWE: "Nowe reklamacje",
  OCZEKIWANIE_NA_PRODUKT: "Oczekiwanie na produkt",
  WERYFIKACJA: "Weryfikacja",
  DECYZJA: "Decyzja",
  ZAAKCEPTOWANA: "Zaakceptowane",
  ODRZUCONA: "Odrzucone",
};

export const COMPLAINT_STATUS_FILTER_ORDER: ComplaintStatusCode[] = [
  "NOWE",
  "OCZEKIWANIE_NA_PRODUKT",
  "WERYFIKACJA",
  "DECYZJA",
  "ZAAKCEPTOWANA",
  "ODRZUCONA",
];

export type ComplaintOrderSummary = {
  id: number;
  number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  source?: string | null;
  city?: string | null;
  country?: string | null;
  value?: number | null;
  currency?: string | null;
  shipping_method?: string | null;
  /** Koszt dostawy z zamówienia (API reklamacji) — podsumowanie zwrotu wysyłki. */
  shipping_cost?: number | null;
  addresses_json?: string | null;
  created_at?: string | null;
};

export type ComplaintRelatedBrief = {
  id: number;
  reference_code?: string | null;
  title?: string | null;
  status?: string;
  created_at?: string | null;
};

export type ComplaintLineDetail = {
  id: number;
  order_item_id: number;
  product_id?: number | null;
  quantity: number;
  reason?: string | null;
  product_name?: string | null;
  sku?: string | null;
  /** Z katalogu produktów (GET reklamacji). */
  product_ean?: string | null;
  product_image_url?: string | null;
  unit_price?: number | null;
  status?: ComplaintStatusCode | string;
  decision?: string | null;
  /** Ostatni ukończony etap operacji fizycznych (pickup, warehouse_in, …) */
  operation_status?: string | null;
  /** Przy decision exchange: EXCHANGE | REPLACEMENT */
  exchange_kind?: string | null;
  /** Rozliczenie pozycji (jak resolution_type zamówienia). */
  settlement_type?: string | null;
  settlement_amount?: number | null;
  settlement_currency?: string | null;
  producer_name?: string | null;
  /** Zdjęcia zgłoszenia dla tej pozycji (ścieżki serwera). */
  photo_urls?: string[];
  customer_photos?: string[];
  warehouse_photos?: string[];
  defect_ids?: string[];
  defects?: { id: string; name: string }[];
  /** Notatka magazynowa zapisana z WMS (inspection). */
  note_warehouse?: string | null;
};

export type ComplaintListItem = {
  id: number;
  title: string;
  reference_code?: string | null;
  created_at?: string | null;
  response_deadline?: string | null;
  auto_accepted?: boolean;
  accepted_by_law?: boolean;
  response_deadline_days_remaining?: number | null;
  response_deadline_is_overdue?: boolean;
  order_id?: number | null;
  order_number?: string | null;
  status: ComplaintStatusCode | string;
  product_image_url?: string | null;
  product_name?: string | null;
  product_sku?: string | null;
  product_ean?: string | null;
  line_quantity?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  defect_ids?: string[];
  customer_reason?: string | null;
  /** Z listy `GET /complaints/` — liczba wierszy `complaint_lines` (kafel kolejki). */
  lines_count?: number | null;
};

export type ComplaintDocumentItem = {
  id: number;
  type: string;
  title?: string | null;
  file_url: string;
  created_at?: string | null;
  meta?: Record<string, unknown> | null;
};

export type ComplaintAuditEvent = {
  type: string;
  message: string;
  user?: string | null;
  timestamp: string;
  meta?: Record<string, unknown> | null;
};

/** Structured event log (machine-readable); UI labels come from event_type + payload, not the API. */
export type ComplaintStructuredEvent = {
  id: string;
  complaint_id: number;
  line_id?: number | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  actor?: string;
};

export type ComplaintDetail = {
  id: number;
  tenant_id: number;
  warehouse_id: number;
  order_id?: number | null;
  parent_complaint_id?: number | null;
  parent_complaint?: ComplaintRelatedBrief | null;
  child_complaints?: ComplaintRelatedBrief[];
  title: string;
  reference_code?: string | null;
  description?: string | null;
  created_at?: string | null;
  response_deadline?: string | null;
  auto_accepted?: boolean;
  /** Równoznaczne z auto_accepted — akceptacja z mocy prawa po terminie. */
  accepted_by_law?: boolean;
  response_deadline_days_remaining?: number | null;
  response_deadline_is_overdue?: boolean;
  waiting_for_product_since?: string | null;
  waiting_reminder_sent_at?: string | null;
  waiting_product_followup_due?: boolean;
  audit_events?: ComplaintAuditEvent[];
  complaint_events?: ComplaintStructuredEvent[];
  status: ComplaintStatusCode | string;
  order?: ComplaintOrderSummary | null;
  lines?: ComplaintLineDetail[];
  photo_urls?: string[];
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_address?: string | null;
  order_source?: string | null;
  product_name?: string | null;
  product_sku?: string | null;
  product_image_url?: string | null;
  customer_photo_urls?: string[] | null;
  warehouse_photo_urls?: string[] | null;
  defect_ids?: string[];
  customer_reason?: string | null;
  major_defect?: boolean;
  repair_failed?: boolean;
  replacement_failed?: boolean;
  operational_decision?: string | null;
  financial_decision?: string | null;
  logistics_status?: string;
  logistics_service_rma?: string | null;
  logistics_expected_return_date?: string | null;
  logistics_in_service_since?: string | null;
  logistics_waiting_reminder?: boolean;
  logistics_service_overdue_alert?: boolean;
  /** Rozliczenie z klientem (API: REPLACEMENT | REFUND | PARTIAL_REFUND | REJECTION) */
  resolution_type?: string | null;
  resolution_status?: string | null;
  resolution_amount?: number | null;
  resolution_currency?: string | null;
  documents?: ComplaintDocumentItem[];
};

export type ComplaintStatusSummaryDto = {
  total: number;
  by_status: { status: string; count: number }[];
};
