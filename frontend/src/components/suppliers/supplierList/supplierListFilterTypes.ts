export type SupplierListStatusFilter = "all" | "active" | "inactive";
export type SupplierListTriStateFilter = "" | "yes" | "no";

export type AppliedSupplierListFilters = {
  name: string;
  status: SupplierListStatusFilter;
  country: string;
  city: string;
  email: string;
  phone: string;
  currency: string;
  requiresMoq: SupplierListTriStateFilter;
  freeShipping: SupplierListTriStateFilter;
  minProductCount: string;
  minOrderCount: string;
};

export const DEFAULT_APPLIED_SUPPLIER_LIST_FILTERS: AppliedSupplierListFilters = {
  name: "",
  status: "all",
  country: "",
  city: "",
  email: "",
  phone: "",
  currency: "",
  requiresMoq: "",
  freeShipping: "",
  minProductCount: "",
  minOrderCount: "",
};

export function triStateToBool(value: SupplierListTriStateFilter): boolean | undefined {
  if (value === "yes") return true;
  if (value === "no") return false;
  return undefined;
}

export function countActiveSupplierFilters(filters: AppliedSupplierListFilters): number {
  let count = 0;
  if (filters.name.trim()) count += 1;
  if (filters.status !== "all") count += 1;
  if (filters.country.trim()) count += 1;
  if (filters.city.trim()) count += 1;
  if (filters.email.trim()) count += 1;
  if (filters.phone.trim()) count += 1;
  if (filters.currency.trim()) count += 1;
  if (filters.requiresMoq) count += 1;
  if (filters.freeShipping) count += 1;
  if (filters.minProductCount.trim()) count += 1;
  if (filters.minOrderCount.trim()) count += 1;
  return count;
}

export function supplierFilterToggleLabel(activeCount: number): string {
  return activeCount > 0 ? `Filtry (${activeCount})` : "Filtry";
}
