import type { CustomerAddressDto } from "../../api/customersApi";
import type { GusLookupResult } from "../../api/gusLookupApi";

function isBlank(v: string | null | undefined): boolean {
  return !String(v ?? "").trim();
}

function pick(current: string, incoming: string | null | undefined): string {
  if (!isBlank(current)) return current;
  return String(incoming ?? "").trim();
}

export type GusFormApplyResult = {
  companyName: string;
  nip: string;
  addresses: CustomerAddressDto[];
};

/** Uzupełnia tylko puste pola — nie nadpisuje istniejących wartości. */
export function applyGusToCustomerForm(
  gus: GusLookupResult,
  current: { companyName: string; nip: string; addresses: CustomerAddressDto[] },
): GusFormApplyResult {
  const addresses = current.addresses.length ? [...current.addresses] : [];
  const defaultIdx = addresses.findIndex((a) => a.is_default);
  const idx = defaultIdx >= 0 ? defaultIdx : 0;

  if (addresses[idx]) {
    const addr = { ...addresses[idx] };
    addr.company_name = pick(addr.company_name ?? "", gus.company_name);
    addr.street = pick(addr.street, gus.street);
    addr.house_number = pick(addr.house_number, gus.house_number);
    addr.apartment_number = pick(addr.apartment_number ?? "", gus.apartment_number);
    addr.postal_code = pick(addr.postal_code, gus.postal_code);
    addr.city = pick(addr.city, gus.city);
    addr.country_code = pick(addr.country_code, "PL") || "PL";
    addresses[idx] = addr;
  }

  return {
    companyName: pick(current.companyName, gus.company_name),
    nip: pick(current.nip, gus.nip ?? ""),
    addresses,
  };
}
