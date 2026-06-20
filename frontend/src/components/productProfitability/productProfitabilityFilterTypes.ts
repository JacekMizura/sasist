export type AppliedProductProfitabilityFilters = {
  rangeDays: number;
  sort: string;
  onlyLoss: boolean;
  onlyLowMargin: boolean;
  onlyNoSales: boolean;
  onlyTopProfit: boolean;
  onlyHighStock: boolean;
};

export const DEFAULT_APPLIED_PRODUCT_PROFITABILITY_FILTERS: AppliedProductProfitabilityFilters = {
  rangeDays: 30,
  sort: "lowest_profit",
  onlyLoss: false,
  onlyLowMargin: false,
  onlyNoSales: false,
  onlyTopProfit: false,
  onlyHighStock: false,
};

export function countActiveProductProfitabilityFilters(filters: AppliedProductProfitabilityFilters): number {
  let count = 0;
  if (filters.rangeDays !== 30) count += 1;
  if (filters.sort !== "lowest_profit") count += 1;
  if (filters.onlyLoss) count += 1;
  if (filters.onlyLowMargin) count += 1;
  if (filters.onlyNoSales) count += 1;
  if (filters.onlyTopProfit) count += 1;
  if (filters.onlyHighStock) count += 1;
  return count;
}

export function productProfitabilityFilterToggleLabel(activeCount: number): string {
  return activeCount > 0 ? `Filtry (${activeCount})` : "Filtry";
}
