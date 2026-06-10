import type { CustomerAddressDto } from "../../api/customersApi";
import type { GusLookupResult } from "../../api/customersGusApi";

function isBlank(v: string | null | undefined): boolean {
  return !String(v ?? "").trim();
}

function pick(current: string, incoming: string | null | undefined): string {
  if (!isBlank(current)) return current;
  return String(incoming ?? "").trim();
}

function assign(current: string, incoming: string | null | undefined, overwrite: boolean): string {
  const inc = String(incoming ?? "").trim();
  if (overwrite && inc) return inc;
  return pick(current, incoming);
}

export type GusFormApplyResult = {
  companyName: string;
  nip: string;
  addresses: CustomerAddressDto[];
};

/** Uzupełnia puste pola; tryb nadpisania — tylko dla administratora. */
export function applyGusToCustomerForm(
  gus: GusLookupResult,
  current: { companyName: string; nip: string; addresses: CustomerAddressDto[] },
  overwrite = false,
): GusFormApplyResult {
  const addresses = current.addresses.length ? [...current.addresses] : [];
  const defaultIdx = addresses.findIndex((a) => a.is_default);
  const idx = defaultIdx >= 0 ? defaultIdx : 0;

  if (addresses[idx]) {
    const addr = { ...addresses[idx] };
    addr.company_name = assign(addr.company_name ?? "", gus.company_name, overwrite);
    addr.street = assign(addr.street, gus.street, overwrite);
    addr.house_number = assign(addr.house_number, gus.house_number, overwrite);
    addr.apartment_number = assign(addr.apartment_number ?? "", gus.apartment_number, overwrite);
    addr.postal_code = assign(addr.postal_code, gus.postal_code, overwrite);
    addr.city = assign(addr.city, gus.city, overwrite);
    addr.country_code = assign(addr.country_code, "PL", overwrite) || "PL";
    addresses[idx] = addr;
  }

  return {
    companyName: assign(current.companyName, gus.company_name, overwrite),
    nip: assign(current.nip, gus.nip ?? "", overwrite),
    addresses,
  };
}
