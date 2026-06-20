export type ManufacturerListStatusFilter = "all" | "active" | "inactive";

export type AppliedManufacturerListFilters = {
  name: string;
  country: string;
  status: ManufacturerListStatusFilter;
  nip: string;
  city: string;
  email: string;
  phone: string;
  supplier: string;
};

export const DEFAULT_APPLIED_MANUFACTURER_LIST_FILTERS: AppliedManufacturerListFilters = {
  name: "",
  country: "",
  status: "all",
  nip: "",
  city: "",
  email: "",
  phone: "",
  supplier: "",
};

export function countActiveManufacturerFilters(filters: AppliedManufacturerListFilters): number {
  let count = 0;
  if (filters.name.trim()) count += 1;
  if (filters.country.trim()) count += 1;
  if (filters.status !== "all") count += 1;
  if (filters.nip.trim()) count += 1;
  if (filters.city.trim()) count += 1;
  if (filters.email.trim()) count += 1;
  if (filters.phone.trim()) count += 1;
  if (filters.supplier.trim()) count += 1;
  return count;
}

export function manufacturerFilterToggleLabel(activeCount: number): string {
  return activeCount > 0 ? `Filtry (${activeCount})` : "Filtry";
}
