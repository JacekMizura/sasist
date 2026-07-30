/**
 * Order-detail address / contact / billing parsing helpers.
 * Extracted from OrderDetailPage.tsx — pure functions, no logic changes.
 */

export function uniqJoinedAddressParts(parts: unknown[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const t = typeof p === "string" ? p.trim() : p != null ? String(p).trim() : "";
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.join(" ");
}

export function parseShippingAddressBlock(json: string | null | undefined): string[] {
  if (!json?.trim()) return ["—"];
  try {
    const root = JSON.parse(json) as Record<string, unknown>;
    const ship = (root.shipping ?? root.delivery) as Record<string, unknown> | undefined;
    if (ship && typeof ship === "object") {
      const mainStreet = uniqJoinedAddressParts([ship.street, ship.street_name, ship.address, ship.Ulica]);
      const s2raw = ship.street2 ?? ship.address_extra;
      const s2 = typeof s2raw === "string" ? s2raw.trim() : s2raw != null ? String(s2raw).trim() : "";
      const streetBlocks: string[] = [];
      if (mainStreet) streetBlocks.push(mainStreet);
      if (s2 && s2.toLowerCase() !== mainStreet.toLowerCase()) streetBlocks.push(s2);
      const streetLine = streetBlocks.join(", ");
      const parts = [
        ship.name,
        streetLine,
        uniqJoinedAddressParts([ship.postal_code, ship.postcode, ship.zip, ship["Kod pocztowy"]]),
        uniqJoinedAddressParts([ship.city, ship.town, ship.Miejscowość]),
        uniqJoinedAddressParts([ship.country, ship.Kraj]),
      ]
        .map((x) => (typeof x === "string" ? x.trim() : x != null ? String(x).trim() : ""))
        .filter(Boolean);
      if (parts.length) return parts;
    }
    const bill = root.billing as Record<string, unknown> | undefined;
    if (bill && typeof bill === "object") {
      const parts = [
        bill.name,
        uniqJoinedAddressParts([bill.street, bill.street_name, bill.Ulica]),
        uniqJoinedAddressParts([bill.postal_code, bill.postcode, bill["Kod pocztowy"]]),
        uniqJoinedAddressParts([bill.city, bill.Miejscowość]),
        uniqJoinedAddressParts([bill.country, bill.Kraj]),
      ]
        .map((x) => (typeof x === "string" ? x.trim() : x != null ? String(x).trim() : ""))
        .filter(Boolean);
      if (parts.length) return parts;
    }
  } catch {
    /* ignore */
  }
  return ["—"];
}

export type ShippingAddrDraft = { name: string; street: string; city: string; postal: string; country: string };

export function shippingFromOrderJson(json: string | null | undefined): ShippingAddrDraft {
  const empty: ShippingAddrDraft = { name: "", street: "", city: "", postal: "", country: "" };
  if (!json?.trim()) return empty;
  try {
    const root = JSON.parse(json) as Record<string, unknown>;
    const ship = (root.shipping ?? root.delivery) as Record<string, unknown> | undefined;
    if (!ship || typeof ship !== "object") return empty;
    const street = uniqJoinedAddressParts([ship.street, ship.street_name, ship.address, ship.Ulica]);
    const s2raw = ship.street2 ?? ship.address_extra;
    const street2 = typeof s2raw === "string" ? s2raw.trim() : "";
    let streetCombined = street;
    if (street2 && street2.toLowerCase() !== street.toLowerCase()) {
      streetCombined = street ? `${street}, ${street2}`.trim() : street2;
    }
    const city = uniqJoinedAddressParts([ship.city, ship.town, ship.Miejscowość]) || "";
    const postal = uniqJoinedAddressParts([ship.postal_code, ship.postcode, ship.zip, ship["Kod pocztowy"]]) || "";
    const country = uniqJoinedAddressParts([ship.country, ship.Kraj]) || "";
    const name = typeof ship.name === "string" ? ship.name.trim() : "";
    return {
      name,
      street: streetCombined,
      city: city ?? "",
      postal: postal ?? "",
      country: country ?? "",
    };
  } catch {
    return empty;
  }
}

export function parsePhoneEmail(json: string | null | undefined): { phone: string; email: string } {
  let phone = "—";
  let email = "—";
  if (!json?.trim()) return { phone, email };
  try {
    const root = JSON.parse(json) as Record<string, unknown>;
    for (const key of ["shipping", "billing", "customer", "delivery"]) {
      const block = root[key] as Record<string, unknown> | undefined;
      if (!block || typeof block !== "object") continue;
      const p = block.phone ?? block.mobile ?? block.tel ?? block.Telefon;
      const e = block.email ?? block.mail ?? block.Email;
      if (typeof p === "string" && p.trim() && phone === "—") phone = p.trim();
      if (typeof e === "string" && e.trim() && email === "—") email = e.trim();
    }
  } catch {
    /* ignore */
  }
  return { phone, email };
}

export type BillingInvoiceParsed = {
  companyName: string;
  nip: string;
  streetLine: string;
  cityLine: string;
  email: string;
};

export function parseBillingInvoice(json: string | null | undefined): BillingInvoiceParsed {
  const empty: BillingInvoiceParsed = {
    companyName: "",
    nip: "",
    streetLine: "",
    cityLine: "",
    email: "",
  };
  if (!json?.trim()) return empty;
  try {
    const root = JSON.parse(json) as Record<string, unknown>;
    const bill = root.billing as Record<string, unknown> | undefined;
    if (!bill || typeof bill !== "object") return empty;
    const companyName = String(bill.company_name ?? bill.name ?? bill.firma ?? "").trim();
    const nip = String(bill.nip ?? bill.NIP ?? bill.tax_id ?? "").trim();
    const email = String(bill.email ?? bill.mail ?? "").trim();
    const street = uniqJoinedAddressParts([bill.street, bill.street_name, bill.Ulica]);
    const street2 = typeof bill.address_extra === "string" ? bill.address_extra.trim() : "";
    const streetLine = street2 && street2.toLowerCase() !== street.toLowerCase() ? `${street} / ${street2}`.trim() : street;
    const postal = uniqJoinedAddressParts([bill.postal_code, bill.postcode, bill.zip, bill["Kod pocztowy"]]);
    const city = uniqJoinedAddressParts([bill.city, bill.Miejscowość]);
    const country = uniqJoinedAddressParts([bill.country, bill.Kraj]);
    const cityLine = [postal, city, country].filter(Boolean).join(" ");
    return {
      companyName,
      nip,
      streetLine,
      cityLine,
      email,
    };
  } catch {
    return empty;
  }
}

export type ShippingExtrasParsed = {
  company: string;
  phone: string;
  email: string;
  pickupPoint: string;
  pickupCode: string;
};

export function parseShippingExtras(json: string | null | undefined): ShippingExtrasParsed {
  const empty: ShippingExtrasParsed = { company: "", phone: "", email: "", pickupPoint: "", pickupCode: "" };
  if (!json?.trim()) return empty;
  try {
    const root = JSON.parse(json) as Record<string, unknown>;
    const ship = (root.shipping ?? root.delivery) as Record<string, unknown> | undefined;
    if (!ship || typeof ship !== "object") return empty;
    return {
      company: String(ship.company_name ?? ship.company ?? ship.firma ?? "").trim(),
      phone: String(ship.phone ?? ship.mobile ?? ship.tel ?? "").trim(),
      email: String(ship.email ?? ship.mail ?? "").trim(),
      pickupPoint: String(
        ship.pickup_point_name ??
          ship.parcel_locker_name ??
          ship.point_name ??
          ship.locker_name ??
          ship.apm_name ??
          "",
      ).trim(),
      pickupCode: String(ship.pickup_code ?? ship.collection_code ?? ship.access_code ?? ship.locker_code ?? "").trim(),
    };
  } catch {
    return empty;
  }
}

export function paymentStatusIsPaid(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  if (!s) return false;
  if (/nieopłac|nieoplac|unpaid|częściowo|partial|nie\s*zapłac/.test(s)) return false;
  return /opłac|zapłac|paid|complete|zapłacono|opłacone|tak/.test(s);
}
