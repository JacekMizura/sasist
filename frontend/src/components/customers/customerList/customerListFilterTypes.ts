export type CustomerTriState = "" | "yes" | "no";

export type AppliedCustomerListFilters = {
  search: string;
  countryCode: string;
  hasOrders: CustomerTriState;
  hasEmail: CustomerTriState;
  hasPhone: CustomerTriState;
  dateFrom: string;
  dateTo: string;
};

export const DEFAULT_APPLIED_CUSTOMER_LIST_FILTERS: AppliedCustomerListFilters = {
  search: "",
  countryCode: "",
  hasOrders: "",
  hasEmail: "",
  hasPhone: "",
  dateFrom: "",
  dateTo: "",
};

export function triStateToBool(v: CustomerTriState): boolean | undefined {
  if (v === "yes") return true;
  if (v === "no") return false;
  return undefined;
}
