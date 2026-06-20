export type CartonsListStatusFilter = "all" | "active" | "inactive";
export type CartonsListSortKey = "name" | "stock" | "net";

export type AppliedCartonsListFilters = {
  search: string;
  status: CartonsListStatusFilter;
  sort: CartonsListSortKey;
};

export const DEFAULT_APPLIED_CARTONS_LIST_FILTERS: AppliedCartonsListFilters = {
  search: "",
  status: "all",
  sort: "name",
};

export function countActiveCartonsListFilters(filters: AppliedCartonsListFilters): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.status !== "all") count += 1;
  if (filters.sort !== "name") count += 1;
  return count;
}

export function cartonsListFilterToggleLabel(activeCount: number): string {
  return activeCount > 0 ? `Filtry (${activeCount})` : "Filtry";
}
