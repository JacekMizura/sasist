export type PackagingListStatusFilter = "all" | "active" | "inactive";
export type PackagingListSortKey = "name" | "stock" | "supplier" | "net";

export type AppliedPackagingListFilters = {
  search: string;
  materialType: string;
  supplierId: string;
  lowStockOnly: boolean;
  status: PackagingListStatusFilter;
  sort: PackagingListSortKey;
};

export const DEFAULT_APPLIED_PACKAGING_LIST_FILTERS: AppliedPackagingListFilters = {
  search: "",
  materialType: "",
  supplierId: "",
  lowStockOnly: false,
  status: "all",
  sort: "name",
};

export function countActivePackagingListFilters(filters: AppliedPackagingListFilters): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.materialType) count += 1;
  if (filters.supplierId) count += 1;
  if (filters.lowStockOnly) count += 1;
  if (filters.status !== "all") count += 1;
  if (filters.sort !== "name") count += 1;
  return count;
}

export function packagingListFilterToggleLabel(activeCount: number): string {
  return activeCount > 0 ? `Filtry (${activeCount})` : "Filtry";
}

export const PACKAGING_TYPE_LABELS: Record<string, string> = {
  stretch_foil: "Folia stretch",
  packing_tape: "Taśma pakowa",
  paper_filler: "Wypełniacz papierowy",
  bubble_wrap: "Folia bąbelkowa",
  courier_envelope: "Koperta kurierska",
  label_roll: "Rolka etykiet",
  other: "Inne",
  tape: "Taśma (legacy)",
  foil: "Folia (legacy)",
  filler: "Wypełniacz (legacy)",
};

export const PACKAGING_UNIT_LABELS: Record<string, string> = {
  roll: "Rolka",
  pcs: "Sztuka",
  kg: "Kilogram",
};
