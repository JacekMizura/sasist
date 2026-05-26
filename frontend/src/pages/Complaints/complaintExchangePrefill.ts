import type { ComplaintDetail } from "../../types/complaint";

export type ComplaintOrderKind = "EXCHANGE" | "REPLACEMENT";

/** Widok szczegółów: zamówienie reklamacyjne — gdy decyzja operacyjna to wymiana (API: małe litery). */
export function isOperationalExchangePath(data: ComplaintDetail): boolean {
  return String(data.operational_decision ?? "").trim().toLowerCase() === "exchange";
}

function deepFindStr(obj: unknown, wantKeys: Set<string>): string | null {
  if (obj == null) return null;
  if (typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (wantKeys.has(k.toLowerCase()) && v != null) {
        const s = String(v).trim();
        if (s) return s;
      }
      const r = deepFindStr(v, wantKeys);
      if (r) return r;
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = deepFindStr(item, wantKeys);
      if (r) return r;
    }
  }
  return null;
}

function contactFromAddressesJson(raw: string | null | undefined): { phone: string; email: string } {
  if (!raw?.trim()) return { phone: "", email: "" };
  try {
    const parsed = JSON.parse(raw) as unknown;
    const phone = deepFindStr(parsed, new Set(["phone", "telephone", "tel", "mobile", "phone_number"]));
    const email = deepFindStr(parsed, new Set(["email", "e_mail", "mail"]));
    return { phone: phone ?? "", email: email ?? "" };
  } catch {
    return { phone: "", email: "" };
  }
}

/** Klient + adres rozliczeniowy z reklamacji i — jeśli jest — `order.addresses_json`. */
export function complaintCustomerBillingPrefill(data: ComplaintDetail): {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  billing_street: string;
  billing_city: string;
  billing_postal_code: string;
  billing_country: string;
} {
  const order = data.order;
  const parts = (data.customer_name ?? "").trim().split(/\s+/).filter(Boolean);
  let firstName = parts[0] ?? "";
  let lastName = parts.slice(1).join(" ");
  if (order?.first_name?.trim()) firstName = order.first_name.trim();
  if (order?.last_name?.trim()) lastName = order.last_name.trim();

  let phone = (data.customer_phone ?? "").trim();
  let email = (data.customer_email ?? "").trim();
  let billing_street = "";
  let billing_city = "";
  let billing_postal_code = "";
  let billing_country = "";

  const rawAddr = order?.addresses_json?.trim();
  if (rawAddr) {
    const c = contactFromAddressesJson(rawAddr);
    if (!phone) phone = c.phone;
    if (!email) email = c.email;
    try {
      const parsed = JSON.parse(rawAddr) as unknown;
      billing_street =
        deepFindStr(parsed, new Set(["street", "ulica", "address1", "line1", "address_line1"])) ?? "";
      billing_city = deepFindStr(parsed, new Set(["city", "miasto", "town", "locality"])) ?? "";
      billing_postal_code =
        deepFindStr(parsed, new Set(["postal_code", "postcode", "zip", "kod", "kod_pocztowy"])) ?? "";
      billing_country = deepFindStr(parsed, new Set(["country", "kraj", "country_code"])) ?? "";
    } catch {
      /* ignore */
    }
  }

  if (!billing_street.trim()) {
    billing_street = (data.customer_address ?? "").trim();
  }

  return {
    firstName,
    lastName,
    phone,
    email,
    billing_street,
    billing_city,
    billing_postal_code,
    billing_country,
  };
}

export type ComplaintExchangeLinePrefill = {
  productId: number;
  quantity: number;
  unitPrice: number | null;
};

/** Przekazywane w `navigate(..., { state: { complaintExchangePrefill } })` → CreateOrderPage. */
export type ComplaintExchangePrefillState = {
  complaintId: number;
  tenantId: number;
  warehouseId: number;
  originalOrderId: number | null;
  /** Osobne ścieżki: wymiana (dostawa + odbiór) vs. samo wysłanie nowego towaru */
  complaintOrderKind: ComplaintOrderKind;
  /** Pozycja reklamacji — prefill tylko tej linii + po zapisie zamówienia aktualizacja decyzji na linii */
  complaintLineId: number | null;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  billingStreet: string;
  lines: ComplaintExchangeLinePrefill[];
};

export function buildComplaintExchangePrefill(
  data: ComplaintDetail,
  complaintOrderKind: ComplaintOrderKind,
  complaintLineId?: number | null,
): ComplaintExchangePrefillState {
  const parts = (data.customer_name ?? "").trim().split(/\s+/).filter(Boolean);
  const srcLines =
    complaintLineId != null
      ? (data.lines ?? []).filter((l) => l.id === complaintLineId)
      : (data.lines ?? []);
  return {
    complaintId: data.id,
    tenantId: data.tenant_id,
    warehouseId: data.warehouse_id,
    originalOrderId: data.order_id ?? null,
    complaintOrderKind,
    complaintLineId: complaintLineId ?? null,
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
    phone: (data.customer_phone ?? "").trim(),
    email: (data.customer_email ?? "").trim(),
    billingStreet: (data.customer_address ?? "").trim(),
    lines: srcLines
      .filter((l) => l.product_id != null && l.product_id > 0)
      .map((l) => ({
        productId: l.product_id as number,
        quantity: Math.max(1, Number(l.quantity) || 1),
        unitPrice: l.unit_price ?? null,
      })),
  };
}
