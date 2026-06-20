export type BundleListStatusFilter = "all" | "active" | "inactive";

export type AppliedBundleListFilters = {
  name: string;
  eanSku: string;
  stockMin: string;
  stockMax: string;
  priceMin: string;
  priceMax: string;
  status: BundleListStatusFilter;
};

export const DEFAULT_APPLIED_BUNDLE_LIST_FILTERS: AppliedBundleListFilters = {
  name: "",
  eanSku: "",
  stockMin: "",
  stockMax: "",
  priceMin: "",
  priceMax: "",
  status: "active",
};

export function countActiveBundleListFilters(filters: AppliedBundleListFilters): number {
  let count = 0;
  if (filters.name.trim()) count += 1;
  if (filters.eanSku.trim()) count += 1;
  if (filters.stockMin.trim() || filters.stockMax.trim()) count += 1;
  if (filters.priceMin.trim() || filters.priceMax.trim()) count += 1;
  if (filters.status !== "all") count += 1;
  return count;
}

export function bundleListFilterToggleLabel(activeCount: number): string {
  return activeCount > 0 ? `Filtry (${activeCount})` : "Filtry";
}
