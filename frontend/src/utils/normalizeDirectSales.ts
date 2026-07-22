import type { DirectSaleCompletion } from "../types/directSalesCompletion";
import { normalizeCompletion } from "./normalizeDirectSalesCompletion";
import { safeDisplay, safeTrim } from "./safeStrings";

export type DirectSaleSessionTotals = {
  subtotal_gross: number;
  line_discounts_gross: number;
  lines_gross: number;
  order_discount_gross: number;
  total_discount_gross: number;
  total_net: number;
  total_vat: number;
  total_gross: number;
};

export type DirectSaleSessionLine = {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number | null;
  line_discount_type: string | null;
  line_discount_value: number;
  discount_amount: number;
  line_gross: number | null;
  line_net: number | null;
  source_location_id: number | null;
  suggested_location_id: number | null;
  sort_order: number;
  product_name: string | null;
  product_sku: string | null;
  product_ean: string | null;
  product_catalog_number: string | null;
  margin_percent: number | null;
  image_url: string | null;
  source_location_code: string | null;
  operational_zone_type: string | null;
  available_qty_hint: number | null;
  has_reservation: boolean;
};

export type DirectSaleShippingAddress = {
  first_name: string;
  last_name: string;
  company_name: string | null;
  street: string;
  house_number: string;
  apartment_number: string | null;
  postal_code: string;
  city: string;
  country_code: string;
  phone: string | null;
  email: string | null;
};

export type DirectSaleFulfillment = {
  mode: "PICKUP" | "DELIVERY";
  shipping_address: DirectSaleShippingAddress | null;
  customer_address_id: number | null;
  shipping_method_id: string | null;
  pickup_point_code: string | null;
  pickup_point_label: string | null;
  payment_terms_mode: "IMMEDIATE" | "DEFERRED";
  payment_terms_days: number | null;
};

export type DirectSaleSession = {
  id: number;
  tenant_id: number;
  warehouse_id: number;
  operator_user_id: number | null;
  workstation_id: number | null;
  operational_zone_id: number | null;
  status: string;
  order_id: number | null;
  issue_strategy: string;
  reservation_scope: string;
  customer_id: number | null;
  customer_is_retail: boolean;
  document_subtype: string;
  order_discount_type: string | null;
  order_discount_value: number;
  expires_at: string | null;
  payment_context: Record<string, unknown> | null;
  fulfillment: DirectSaleFulfillment;
  totals: DirectSaleSessionTotals | null;
  lines: DirectSaleSessionLine[];
};

export type DirectSaleProductSearchHit = {
  offer_id: number | null;
  product_id: number;
  name: string;
  stock_disposition: string | null;
  sku: string | null;
  ean: string | null;
  catalog_number: string | null;
  image_url: string | null;
  unit_price: number | null;
  available_qty: number;
  preferred_location_id: number | null;
  preferred_location_code: string | null;
  operational_zone_type: string | null;
};

export type DirectSaleCompleteResult = {
  session_id: number;
  order_id: number;
  payment_id: number;
  document_job_id: number | null;
  document_number: string | null;
  total_amount: number;
  payment_status: string | null;
  payment_method: string | null;
  completion: DirectSaleCompletion | null;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  const s = safeTrim(v);
  return s || null;
}

function normalizeSessionTotals(raw: unknown): DirectSaleSessionTotals | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    subtotal_gross: num(r.subtotal_gross),
    line_discounts_gross: num(r.line_discounts_gross),
    lines_gross: num(r.lines_gross),
    order_discount_gross: num(r.order_discount_gross),
    total_discount_gross: num(r.total_discount_gross),
    total_net: num(r.total_net),
    total_vat: num(r.total_vat),
    total_gross: num(r.total_gross),
  };
}

export function normalizeDirectSaleLine(raw: unknown): DirectSaleSessionLine {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: num(r.id),
    product_id: num(r.product_id),
    quantity: num(r.quantity),
    unit_price: numOrNull(r.unit_price),
    line_discount_type: strOrNull(r.line_discount_type),
    line_discount_value: num(r.line_discount_value),
    discount_amount: num(r.discount_amount),
    line_gross: numOrNull(r.line_gross),
    line_net: numOrNull(r.line_net),
    source_location_id: numOrNull(r.source_location_id),
    suggested_location_id: numOrNull(r.suggested_location_id),
    sort_order: num(r.sort_order),
    product_name: strOrNull(r.product_name),
    product_sku: strOrNull(r.product_sku),
    product_ean: strOrNull(r.product_ean),
    product_catalog_number: strOrNull(r.product_catalog_number),
    margin_percent: numOrNull(r.margin_percent),
    image_url: strOrNull(r.image_url),
    source_location_code: strOrNull(r.source_location_code),
    operational_zone_type: strOrNull(r.operational_zone_type),
    available_qty_hint: numOrNull(r.available_qty_hint),
    has_reservation: Boolean(r.has_reservation),
  };
}

export function normalizeDirectSaleFulfillment(raw: unknown): DirectSaleFulfillment {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mode = String(r.mode || "PICKUP").toUpperCase() === "DELIVERY" ? "DELIVERY" : "PICKUP";
  const termsMode =
    String(r.payment_terms_mode || "IMMEDIATE").toUpperCase() === "DEFERRED" ? "DEFERRED" : "IMMEDIATE";
  let shipping_address: DirectSaleShippingAddress | null = null;
  if (r.shipping_address && typeof r.shipping_address === "object") {
    const a = r.shipping_address as Record<string, unknown>;
    shipping_address = {
      first_name: safeDisplay(a.first_name, ""),
      last_name: safeDisplay(a.last_name, ""),
      company_name: strOrNull(a.company_name),
      street: safeDisplay(a.street, ""),
      house_number: safeDisplay(a.house_number, ""),
      apartment_number: strOrNull(a.apartment_number),
      postal_code: safeDisplay(a.postal_code, ""),
      city: safeDisplay(a.city, ""),
      country_code: safeDisplay(a.country_code, "PL"),
      phone: strOrNull(a.phone),
      email: strOrNull(a.email),
    };
  }
  return {
    mode,
    shipping_address,
    customer_address_id: numOrNull(r.customer_address_id),
    shipping_method_id: strOrNull(r.shipping_method_id),
    pickup_point_code: strOrNull(r.pickup_point_code),
    pickup_point_label: strOrNull(r.pickup_point_label),
    payment_terms_mode: termsMode,
    payment_terms_days: numOrNull(r.payment_terms_days),
  };
}

export function normalizeDirectSaleSession(raw: unknown): DirectSaleSession {
  const r = (raw ?? {}) as Record<string, unknown>;
  const linesRaw = Array.isArray(r.lines) ? r.lines : [];
  const payCtx =
    r.payment_context && typeof r.payment_context === "object" && !Array.isArray(r.payment_context)
      ? (r.payment_context as Record<string, unknown>)
      : null;
  return {
    id: num(r.id),
    tenant_id: num(r.tenant_id),
    warehouse_id: num(r.warehouse_id),
    operator_user_id: numOrNull(r.operator_user_id),
    workstation_id: numOrNull(r.workstation_id),
    operational_zone_id: numOrNull(r.operational_zone_id),
    status: safeDisplay(r.status, "ACTIVE"),
    order_id: numOrNull(r.order_id),
    issue_strategy: safeDisplay(r.issue_strategy, "STRICT_LOCATION"),
    reservation_scope: safeDisplay(r.reservation_scope, "SESSION"),
    customer_id: numOrNull(r.customer_id),
    customer_is_retail: Boolean(r.customer_is_retail),
    document_subtype: safeDisplay(r.document_subtype, "RECEIPT"),
    order_discount_type: strOrNull(r.order_discount_type),
    order_discount_value: num(r.order_discount_value),
    expires_at: strOrNull(r.expires_at),
    payment_context: payCtx,
    fulfillment: normalizeDirectSaleFulfillment(r.fulfillment),
    totals: normalizeSessionTotals(r.totals),
    lines: linesRaw.map(normalizeDirectSaleLine),
  };
}

export function normalizeProductSearchHit(raw: unknown): DirectSaleProductSearchHit {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    offer_id: numOrNull(r.offer_id),
    product_id: num(r.product_id),
    name: safeDisplay(r.name, "Produkt"),
    stock_disposition: strOrNull(r.stock_disposition),
    sku: strOrNull(r.sku),
    ean: strOrNull(r.ean),
    catalog_number: strOrNull(r.catalog_number),
    image_url: strOrNull(r.image_url),
    unit_price: numOrNull(r.unit_price),
    available_qty: num(r.available_qty),
    preferred_location_id: numOrNull(r.preferred_location_id),
    preferred_location_code: strOrNull(r.preferred_location_code),
    operational_zone_type: strOrNull(r.operational_zone_type),
  };
}

export function normalizeCompleteResult(raw: unknown): DirectSaleCompleteResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    session_id: num(r.session_id),
    order_id: num(r.order_id),
    payment_id: num(r.payment_id),
    document_job_id: numOrNull(r.document_job_id),
    document_number: strOrNull(r.document_number),
    total_amount: num(r.total_amount),
    payment_status: strOrNull(r.payment_status),
    payment_method: strOrNull(r.payment_method),
    completion: normalizeCompletion(r.completion),
  };
}
