import type { CustomerListRow } from "../../../api/customersApi";
import { getCustomerDisplayName } from "../../../utils/getCustomerDisplayName";

export function customerListClientLines(row: CustomerListRow): {
  primary: string;
  secondary: string | null;
} {
  const primary = getCustomerDisplayName(row);
  const nip = row.nip?.trim();
  const email = row.email?.trim();

  if (nip) {
    return { primary, secondary: `NIP: ${nip}` };
  }
  if (email) {
    return { primary, secondary: email };
  }
  return { primary, secondary: null };
}

export function customerListCellOrDash(value: string | null | undefined): string {
  const v = value?.trim();
  return v ? v : "—";
}
