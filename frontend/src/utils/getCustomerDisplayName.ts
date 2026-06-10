import { safeTrim } from "./safeStrings";

export type CustomerDisplayNameInput = {
  id?: number | null;
  company_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  /** Wiersz listy — gdy brak pól źródłowych (np. z API listy). */
  display_name?: string | null;
};

/** Wspólna nazwa klienta w UI — ta sama kolejność co moduł Klienci. */
export function getCustomerDisplayName(customer: CustomerDisplayNameInput | null | undefined): string {
  if (!customer) return "Klient";

  const company = safeTrim(customer.company_name);
  if (company) return company;

  const person = `${safeTrim(customer.first_name)} ${safeTrim(customer.last_name)}`.trim();
  if (person) return person;

  const email = safeTrim(customer.email);
  if (email) return email;

  const fromList = safeTrim(customer.display_name);
  if (fromList) return fromList;

  if (customer.id != null) return `Klient #${customer.id}`;
  return "Klient";
}

export function getCustomerDefaultAddress<T extends { is_default?: boolean }>(
  addresses: T[] | null | undefined,
): T | null {
  if (!addresses?.length) return null;
  return addresses.find((a) => a.is_default) ?? addresses[0] ?? null;
}

export function formatCustomerAddressStreet(addr: {
  street?: string | null;
  house_number?: string | null;
  apartment_number?: string | null;
}): string {
  const street = safeTrim(addr.street);
  const house = safeTrim(addr.house_number);
  const apt = safeTrim(addr.apartment_number);
  if (!street && !house) return "";
  const base = [street, house].filter(Boolean).join(" ");
  return apt ? `${base}/${apt}` : base;
}
